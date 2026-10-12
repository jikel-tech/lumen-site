// Génère les pages statiques d'archives (SEO) à partir de data/articles.json :
//   jour/AAAA-MM-JJ.html  → l'actualité tech du jour (une page indexable par jour)
//   jour/index.html       → liste des archives
//   sitemap.xml           → accueil + archives + analyses hebdomadaires
// Exécuté une fois par jour (workflow daily-pages.yml) : un seul redéploiement Netlify par jour.
//
// Variables de test : DATA_DIR (données), OUT_DIR (racine du site, défaut = racine du dépôt).

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, DATA, SITE_URL, readJson, writeJson, escapeHtml as h, safeUrl, frDate, dayKey, pageShell, CAT_LABELS } from './lib.js';

const OUT = process.env.OUT_DIR || ROOT;
const ORDER = ['afrique', 'ia', 'smartphones', 'logiciels', 'culture'];

async function listPages(dir, re) {
  try {
    return (await readdir(path.join(OUT, dir))).filter((f) => re.test(f)).sort().reverse();
  } catch {
    return [];
  }
}

function dayPage(day, items) {
  const dateLong = frDate(`${day}T12:00:00Z`, { dateStyle: 'full' });
  const title = `Actu tech du ${dateLong} — LUMen`;
  const byCat = ORDER.map((c) => [c, items.filter((a) => a.category === c)]).filter(([, l]) => l.length);
  const topKeywords = [...new Set(items.flatMap((a) => a.keywords || []))].slice(0, 6);
  const description = `${items.length} actualités tech du ${dateLong} résumées et sourcées : ${byCat.map(([c]) => CAT_LABELS[c]).join(', ')}${topKeywords.length ? ' — ' + topKeywords.slice(0, 4).join(', ') : ''}.`;

  const sections = byCat
    .map(
      ([cat, list]) => `<h2>${h(CAT_LABELS[cat] || cat)}</h2>
${list
  .map(
    (a) => `<article class="item">
<h3><a href="${h(safeUrl(a.url))}" rel="noopener noreferrer" target="_blank">${h(a.title)}</a></h3>
${a.summary ? `<p>${h(a.summary)}</p>` : ''}
<div class="meta">${h(a.source)}${(a.also || []).length ? ' · aussi : ' + a.also.map((x) => h(x.source)).join(', ') : ''}</div>
${(a.keywords || []).length ? `<div class="kw">${a.keywords.map(h).join(' · ')}</div>` : ''}
</article>`
  )
  .join('\n')}`
    )
    .join('\n');

  const body = `<p class="meta">${h(dateLong)}</p>
<h1>L’actualité tech du ${h(dateLong)}</h1>
<p class="lead">${items.length} actualités sélectionnées par LUMen, avec un résumé court et un lien vers l’article d’origine.</p>
${sections}
<p class="note">Les résumés sont générés avec l’aide de l’IA à partir du titre et de l’extrait publiés par les sources. Pour le détail, consultez toujours l’article d’origine.</p>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${SITE_URL}/jour/${day}.html`,
    inLanguage: 'fr',
    datePublished: `${day}T00:00:00+01:00`,
    isPartOf: { '@type': 'WebSite', name: 'LUMen', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.title, url: safeUrl(a.url) })),
    },
  };
  return pageShell({ title, description, path: `/jour/${day}.html`, body, jsonLd });
}

async function main() {
  const articles = await readJson(DATA('articles.json'), []);
  const archive = await readJson(DATA('archive.json'), {});
  await mkdir(path.join(OUT, 'jour'), { recursive: true });
  await mkdir(path.join(OUT, 'hebdo'), { recursive: true });

  const today = process.env.DAY || dayKey();
  const items = articles
    .filter((a) => dayKey(a.pubDate) === today)
    .sort((a, b) => (b.coverage || 1) - (a.coverage || 1) || new Date(b.pubDate) - new Date(a.pubDate));

  if (items.length >= 3) {
    await writeFile(path.join(OUT, 'jour', `${today}.html`), dayPage(today, items), 'utf-8');
    archive[today] = items.length;
    await writeJson(DATA('archive.json'), archive);
    console.log(`📄 jour/${today}.html (${items.length} actus)`);
  } else {
    console.log(`Seulement ${items.length} actu(s) aujourd'hui : page du jour non générée.`);
  }

  // Index des archives
  const days = (await listPages('jour', /^\d{4}-\d{2}-\d{2}\.html$/)).map((f) => f.replace('.html', ''));
  const weeks = (await listPages('hebdo', /^\d{4}-W\d{2}\.html$/)).map((f) => f.replace('.html', ''));
  const indexBody = `<h1>Archives LUMen</h1>
<p class="lead">Retrouvez l’actualité tech jour par jour, et nos analyses hebdomadaires.</p>
${weeks.length ? `<h2>Analyses de la semaine</h2><ul class="days">${weeks.map((w) => `<li><a href="/hebdo/${w}.html">Semaine ${h(w)}</a></li>`).join('')}</ul>` : ''}
<h2>Jour par jour</h2>
${days.length ? `<ul class="days">${days.map((d) => `<li><a href="/jour/${d}.html">${h(frDate(`${d}T12:00:00Z`, { dateStyle: 'full' }))}</a>${archive[d] ? ` <span class="meta">· ${archive[d]} actus</span>` : ''}</li>`).join('')}</ul>` : '<p class="meta">Les premières archives arrivent bientôt.</p>'}`;
  await writeFile(
    path.join(OUT, 'jour', 'index.html'),
    pageShell({ title: 'Archives de l’actualité tech — LUMen', description: 'Toute l’actualité tech jour par jour, résumée et sourcée par LUMen, avec les analyses hebdomadaires.', path: '/jour/', body: indexBody }),
    'utf-8'
  );

  // Sitemap
  const urls = [
    { loc: `${SITE_URL}/`, freq: 'hourly', prio: '1.0' },
    { loc: `${SITE_URL}/jour/`, freq: 'daily', prio: '0.7' },
    ...days.map((d) => ({ loc: `${SITE_URL}/jour/${d}.html`, lastmod: d, freq: 'never', prio: '0.6' })),
    ...weeks.map((w) => ({ loc: `${SITE_URL}/hebdo/${w}.html`, freq: 'never', prio: '0.8' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.prio}</priority></url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(OUT, 'sitemap.xml'), xml, 'utf-8');
  console.log(`🗺️  sitemap.xml : ${urls.length} URL`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
