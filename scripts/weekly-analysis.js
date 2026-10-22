// Analyse hebdomadaire LUMen : un texte d'analyse "maison" (pas une simple agrégation RSS),
// rédigé avec l'aide de Gemini à partir des actus de la semaine, puis publié :
//   data/weekly.json            → affiché dans la colonne latérale du site
//   hebdo/AAAA-Www.html         → page indexable (SEO)
// Exécuté chaque dimanche (workflow weekly.yml). Sans clé GEMINI_API_KEY, il ne fait rien.
//
// Le texte est présenté comme "rédigé avec l'aide de l'IA". Tu peux le relire/modifier à la main
// dans hebdo/*.html et data/weekly.json avant la semaine suivante si tu veux un ton plus personnel.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, DATA, SITE_URL, readJson, writeJson, escapeHtml as h, safeUrl, frDate, isoWeek, gemini, pageShell, CAT_LABELS, score, readMixed } from './lib.js';

const OUT = process.env.OUT_DIR || ROOT;
const MIN_ARTICLES = 8;

function buildPrompt(items) {
  const list = items
    .map((a, i) => `${i + 1}. [${CAT_LABELS[a.category] || a.category}] ${a.title} (${a.source}${a.coverage > 1 ? `, couvert par ${a.coverage} sources` : ''}) — ${a.summary || ''}`)
    .join('\n');
  return `Tu es l'éditorialiste de LUMen, un site d'actualité tech francophone lu notamment au Cameroun et en Afrique francophone.
Voici les principales actus de la semaine :

${list}

Rédige l'analyse hebdomadaire de LUMen. Réponds uniquement par un objet JSON de la forme :
{"title": string, "intro": string, "sections": [{"heading": string, "text": string}], "takeaway": string}

Règles :
- Langue : français, ton clair, direct, sans jargon inutile, 350 à 450 mots au total.
- title : un titre éditorial précis (pas de point d'exclamation, pas de "Résumé de la semaine").
- intro : 2 phrases qui donnent la thèse de la semaine (ce qui relie les actus).
- sections : exactement 3 — "Ce qui a marqué la semaine", "Ce que cela change pour l'Afrique francophone", "À surveiller" — chacune de 2 à 4 phrases.
- takeaway : une phrase de conclusion.
- Appuie-toi UNIQUEMENT sur les faits de la liste ci-dessus. N'invente aucun chiffre, date, citation ni annonce. Si un lien avec l'Afrique n'est pas dans la liste, formule-le comme une réflexion prudente ("cela pourrait…"), pas comme un fait.
- Cite les sources par leur nom quand tu t'appuies sur une actu précise.`;
}

function valid(o) {
  return o && typeof o.title === 'string' && typeof o.intro === 'string' && typeof o.takeaway === 'string' &&
    Array.isArray(o.sections) && o.sections.length >= 2 && o.sections.every((s) => typeof s.heading === 'string' && typeof s.text === 'string' && s.text.length > 40);
}

function pageBody(week, dateLong, a, items) {
  return `<p class="meta">Analyse de la semaine · ${h(dateLong)}</p>
<h1>${h(a.title)}</h1>
<p class="lead">${h(a.intro)}</p>
${a.sections.map((s) => `<h2>${h(s.heading)}</h2><p>${h(s.text)}</p>`).join('\n')}
<h2>À retenir</h2>
<p>${h(a.takeaway)}</p>
<h2>Les actus de la semaine</h2>
${items.map((x) => `<div class="item"><h3><a href="${h(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${h(x.title)}</a></h3><div class="meta">${h(x.source)} · ${h(CAT_LABELS[x.category] || x.category)}</div></div>`).join('\n')}
<p class="note">Cette analyse a été rédigée avec l’aide de l’IA à partir des titres et résumés des actualités ci-dessus. Elle exprime une lecture éditoriale de LUMen, pas un avis d’expert : consultez les sources pour le détail.</p>`;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.log('GEMINI_API_KEY absente : analyse hebdomadaire ignorée.'); return; }
  const articles = await readMixed();
  const since = Date.now() - 7 * 86400_000;
  const items = articles
    .filter((a) => new Date(a.pubDate).getTime() > since)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 24);
  if (items.length < MIN_ARTICLES) { console.log(`Seulement ${items.length} actus cette semaine : analyse ignorée.`); return; }

  const week = isoWeek();
  const raw = await gemini(buildPrompt(items), { json: true, maxOutputTokens: 2500, temperature: 0.6 });
  let analysis = null;
  try { analysis = JSON.parse(String(raw || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()); } catch { /* invalide */ }
  if (!valid(analysis)) { console.error('Réponse IA invalide : analyse non publiée (l’ancienne reste en place).'); process.exitCode = 1; return; }

  const dateLong = frDate(new Date(), { dateStyle: 'long' });
  const pagePath = `hebdo/${week}.html`;
  await mkdir(path.join(OUT, 'hebdo'), { recursive: true });
  const title = `${analysis.title} — Analyse LUMen`;
  const description = analysis.intro.slice(0, 280);
  await writeFile(
    path.join(OUT, pagePath),
    pageShell({
      title,
      description,
      path: '/' + pagePath,
      body: pageBody(week, dateLong, analysis, items),
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: analysis.title,
        description,
        inLanguage: 'fr',
        datePublished: new Date().toISOString(),
        author: { '@type': 'Organization', name: 'LUMen' },
        publisher: { '@type': 'Organization', name: 'JikelTech', logo: { '@type': 'ImageObject', url: `${SITE_URL}/icons/icon-512.png` } },
        mainEntityOfPage: `${SITE_URL}/${pagePath}`,
      },
    }),
    'utf-8'
  );
  await writeJson(DATA('weekly.json'), { week, date: new Date().toISOString(), title: analysis.title, intro: analysis.intro, path: pagePath, aiAssisted: true });
  console.log(`📝 Analyse ${week} publiée : ${analysis.title}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
