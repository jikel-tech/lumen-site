// Script d'agrégation LUMen
// Lit des flux RSS officiels (pas de scraping de pages HTML : on respecte les conditions
// d'utilisation des sites sources), puis écrit data/articles.json que le site affiche.
// Exécuté toutes les 30 min par GitHub Actions (.github/workflows/fetch-news.yml).
//
// Usage local : cd scripts && npm install && node fetch-news.js
// Variables optionnelles : GEMINI_API_KEY (résumés IA), ANTHROPIC_API_KEY (repli).
// Pour tester avec d'autres flux : FEEDS_PATH=/chemin/feeds.json DATA_DIR=/dossier node fetch-news.js

import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, DATA, readJson, writeJson, safeUrl, gemini } from './lib.js';

const FEEDS_PATH = process.env.FEEDS_PATH || path.join(ROOT, 'scripts', 'feeds.json');
const PER_FEED = 15; // articles retenus par flux à chaque passage
const MAX_ARTICLES = 80; // taille maximale de data/articles.json
const KEEP_DAYS = 5; // on garde les articles plus anciens encore visibles pendant 5 jours
const MAX_NEW_SUMMARIES = 15; // plafond d'appels IA par exécution (protège le quota gratuit)
const EXCERPT_LEN = 200; // extrait de repli : court, jamais l'article complet (droit d'auteur)
const AI_INPUT_LEN = 600; // texte envoyé à l'IA
const FAIL_WARN_AFTER = 6; // alerte si un flux échoue 6 fois de suite (~3 h)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------
// Nettoyage de texte
// -----------------------------------------------------------------------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

// Valeur d'un nœud XML qui peut être une chaîne, un objet {#text, @_attr} ou un tableau.
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return '';
}

function stripHtml(str = '') {
  return decodeEntities(String(str).replace(/<[^>]*>/g, ' '))
    .replace(/(L['’]article|Cet article|The post|This post) .{0,200}?(est apparu en premier sur|appeared first on).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(str, n) {
  if (str.length <= n) return str;
  const cut = str.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)).trimEnd() + '…';
}

// -----------------------------------------------------------------------
// URL et identifiants
// -----------------------------------------------------------------------
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|at_|xtor|ref$)/i.test(k)) url.searchParams.delete(k);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

// IMPORTANT : l'ancien identifiant (début du base64 de l'URL) était identique pour tous les
// sites en "https://www." — d'où des collisions. Un hash de l'URL complète règle le problème.
function articleId(url) {
  return createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 12);
}

function linkOf(item) {
  const l = item.link;
  if (typeof l === 'string') return l;
  const arr = Array.isArray(l) ? l : l ? [l] : [];
  const pick = arr.find((x) => x?.['@_rel'] === 'alternate') || arr.find((x) => !x?.['@_rel']) || arr[0];
  const href = typeof pick === 'string' ? pick : pick?.['@_href'] || text(pick);
  if (href) return href;
  const guid = text(item.guid);
  return /^https?:\/\//.test(guid) ? guid : '';
}

// -----------------------------------------------------------------------
// Catégorisation par mots-clés (le flux ne donne qu'une catégorie par défaut)
// -----------------------------------------------------------------------
const RULES = {
  afrique: ['afrique', 'africain', 'africaine', 'cameroun', 'camerounais', 'douala', 'yaoundé', 'yaounde', 'kribi', 'nigeria', 'kenya', 'sénégal', 'senegal', "côte d'ivoire", 'cote d\'ivoire', 'ghana', 'maroc', 'tunisie', 'rwanda', 'éthiopie', 'mtn', 'orange money', 'mobile money', 'camtel', 'airtel', 'safaricom', 'lagos', 'nairobi', 'dakar', 'abidjan', 'cemac', 'uemoa', 'cedeao'],
  ia: ['intelligence artificielle', 'ia', 'ai', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'llm', 'gpt', 'mistral', 'deepseek', 'copilot', 'midjourney', 'machine learning', 'apprentissage automatique', 'génératif', 'generative', 'agent ia', 'nvidia', 'robot', 'robots', 'artificial intelligence'],
  smartphones: ['smartphone', 'smartphones', 'iphone', 'galaxy', 'pixel', 'android', 'ios', 'xiaomi', 'samsung', 'tecno', 'infinix', 'oppo', 'honor', 'huawei', 'oneplus', 'realme', 'téléphone', 'telephone', 'mobile', 'apple watch', 'montre connectée', 'écouteurs', 'airpods', 'tablette', 'ipad', 'snapdragon', 'processeur', 'puce'],
  logiciels: ['logiciel', 'windows', 'linux', 'macos', 'application', 'navigateur', 'chrome', 'firefox', 'microsoft', 'office', 'cybersécurité', 'cybersecurite', 'faille', 'vulnérabilité', 'piratage', 'open source', 'github', 'api', 'cloud', 'développeur', 'mise à jour', 'vpn', 'mot de passe', 'ransomware', 'startup', 'levée de fonds'],
  culture: ['netflix', 'cinéma', 'série', 'jeu vidéo', 'jeux vidéo', 'gaming', 'playstation', 'xbox', 'nintendo', 'steam', 'réseaux sociaux', 'tiktok', 'instagram', 'youtube', 'streaming', 'musique', 'spotify', 'influenceur', 'x (twitter)', 'meta', 'facebook', 'disney', 'amazon prime', 'espace', 'spacex', 'nasa', 'climat', 'voiture électrique', 'tesla', 'régulation', 'loi'],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULE_RE = Object.fromEntries(
  Object.entries(RULES).map(([cat, terms]) => [
    cat,
    terms.map((t) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])`, 'iu')),
  ])
);

function classify(title, excerpt, feed) {
  if (feed.africa) return 'afrique';
  const scores = {};
  for (const [cat, regs] of Object.entries(RULE_RE)) {
    let s = 0;
    for (const re of regs) {
      if (re.test(title)) s += 2;
      else if (re.test(excerpt)) s += 1;
    }
    scores[cat] = s;
  }
  if (scores.afrique >= 2) return 'afrique'; // signal géographique net
  const best = Object.entries(scores)
    .filter(([c]) => c !== 'afrique')
    .sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : feed.category === 'afrique' ? 'logiciels' : feed.category;
}

// -----------------------------------------------------------------------
// Lecture d'un flux (avec timeout, 1 nouvel essai, tolérance aux formats RSS/Atom/RDF)
// -----------------------------------------------------------------------
async function fetchXml(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'LUMEN-Aggregator/1.0 (+https://jikeltech.netlify.app)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml.slice(0, 3000))) throw new Error('réponse non RSS');
      return xml;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(1500);
    }
  }
  throw lastErr;
}

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchFeed(feed) {
  const xml = await fetchXml(feed.url);
  const parsed = parser.parse(xml);
  const raw = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? parsed?.['rdf:RDF']?.item ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  const now = Date.now();
  const items = [];

  for (const item of list.slice(0, PER_FEED)) {
    try {
      const title = stripHtml(text(item.title));
      const url = safeUrl(linkOf(item));
      if (!title || !url) continue;
      const rawDesc = text(item.description) || text(item.summary) || text(item['content:encoded']) || text(item.content);
      const full = stripHtml(rawDesc);
      const d = new Date(text(item.pubDate) || text(item['dc:date']) || text(item.published) || text(item.updated));
      let pubDate = Number.isNaN(d.getTime()) ? null : d.getTime();
      if (pubDate && pubDate > now + 3600_000) pubDate = now; // date future → maintenant
      items.push({
        id: articleId(url),
        title,
        source: feed.source,
        category: classify(title, full, feed),
        url,
        pubDate: pubDate ? new Date(pubDate).toISOString() : null,
        excerpt: truncate(full, EXCERPT_LEN),
        aiInput: full.slice(0, AI_INPUT_LEN),
      });
    } catch (err) {
      console.error(`Entrée ignorée (${feed.source}) : ${err.message}`);
    }
  }
  return items;
}

// -----------------------------------------------------------------------
// Dédoublonnage : même URL, ou même sujet couvert par plusieurs sources
// -----------------------------------------------------------------------
const STOP = new Set('le la les des une pour avec dans sur par que qui est sont aux ses son leur plus pas comme mais the and for with from that this will new nouveau nouvelle apres avant entre vers chez'.split(' '));

function tokens(title) {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function similar(a, b) {
  if (normalizeUrl(a.url) === normalizeUrl(b.url)) return true;
  const ta = a._tok;
  const tb = b._tok;
  if (ta.size < 3 || tb.size < 3) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter >= 3 && inter / (ta.size + tb.size - inter) >= 0.6;
}

function dedupe(items) {
  items.forEach((it) => (it._tok = tokens(it.title)));
  const groups = [];
  for (const it of items) {
    const g = groups.find((grp) => grp.some((x) => similar(x, it)));
    if (g) g.push(it);
    else groups.push([it]);
  }
  return groups.map((grp) => {
    // L'article principal : celui qui a déjà un résumé IA, sinon le plus ancien (source de l'info).
    const primary = [...grp].sort(
      (a, b) => Number(!!b.aiDone) - Number(!!a.aiDone) || new Date(a.pubDate) - new Date(b.pubDate)
    )[0];
    const bySource = new Map();
    for (const x of grp) if (!bySource.has(x.source)) bySource.set(x.source, x.url);
    const also = [...bySource].filter(([s]) => s !== primary.source).map(([source, url]) => ({ source, url }));
    return { ...primary, coverage: bySource.size, also };
  });
}

// -----------------------------------------------------------------------
// Résumé IA (Gemini, repli Anthropic) — renvoie { summary, keywords } ou null
// -----------------------------------------------------------------------
function buildPrompt(item) {
  return `Tu es rédacteur pour LUMen, un site d'actualité tech francophone lu notamment en Afrique francophone.
À partir du titre et de l'extrait ci-dessous, réponds uniquement par un objet JSON {"summary": string, "keywords": string[]}.
- summary : exactement 3 phrases courtes en français, factuelles, sans recopier les phrases du texte source. N'invente aucun fait absent du titre ou de l'extrait. Cite naturellement la marque, le produit ou l'entreprise concernés.
- keywords : 3 à 5 mots-clés de recherche précis (marque, produit, sujet, pays), en minuscules, sans dièse.
Titre : ${item.title}
Extrait : ${item.aiInput || item.excerpt}`;
}

function parseAi(raw) {
  if (!raw) return null;
  try {
    const clean = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const obj = JSON.parse(clean);
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    if (summary.length < 20 || summary.length > 700) return null;
    const keywords = Array.isArray(obj.keywords)
      ? obj.keywords.filter((k) => typeof k === 'string').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : [];
    return { summary, keywords };
  } catch {
    return null;
  }
}

async function aiSummarize(item) {
  const prompt = buildPrompt(item);
  const fromGemini = parseAi(await gemini(prompt, { json: true, maxOutputTokens: 400 }));
  if (fromGemini) return fromGemini;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      return parseAi(data?.content?.[0]?.text);
    } catch (err) {
      console.error('Résumé Anthropic indisponible :', err.message);
    }
  }
  return null;
}

// -----------------------------------------------------------------------
// Programme principal
// -----------------------------------------------------------------------
async function main() {
  const feeds = JSON.parse(await readFile(FEEDS_PATH, 'utf-8'));
  const OUT = DATA('articles.json');
  const META = DATA('meta.json');
  await mkdir(path.dirname(OUT), { recursive: true });

  const previous = await readJson(OUT, []);
  const prevById = new Map(previous.map((a) => [a.id, a]));
  const meta = await readJson(META, { feeds: {} });
  const nowIso = new Date().toISOString();

  // 1. Collecte (un flux en panne n'empêche pas les autres)
  const results = await Promise.all(
    feeds.map(async (feed) => {
      const h = meta.feeds[feed.url] || { source: feed.source, consecutiveFailures: 0 };
      try {
        const items = await fetchFeed(feed);
        meta.feeds[feed.url] = { source: feed.source, ok: true, lastSuccess: nowIso, lastCount: items.length, consecutiveFailures: 0 };
        return items;
      } catch (err) {
        const n = (h.consecutiveFailures || 0) + 1;
        meta.feeds[feed.url] = { ...h, source: feed.source, ok: false, lastError: err.message, lastErrorAt: nowIso, consecutiveFailures: n };
        console.error(`Échec du flux ${feed.source} : ${err.message}`);
        if (n >= FAIL_WARN_AFTER) console.log(`::warning title=Flux RSS en panne::${feed.source} (${feed.url}) échoue depuis ${n} passages — à remplacer dans scripts/feeds.json`);
        return null;
      }
    })
  );
  const okCount = results.filter(Boolean).length;
  if (okCount === 0) {
    console.error('❌ Aucun flux accessible : data/articles.json est laissé intact.');
    return;
  }

  // 2. Fusion avec l'existant : on réutilise résumés/mots-clés déjà calculés (pas de nouvel appel IA)
  const fresh = results.flat().filter(Boolean).map((it) => {
    const prev = prevById.get(it.id);
    return {
      ...it,
      pubDate: it.pubDate || prev?.pubDate || nowIso,
      summary: prev?.summary || it.excerpt,
      keywords: prev?.keywords || [],
      aiDone: !!prev?.aiDone,
    };
  });
  const freshIds = new Set(fresh.map((a) => a.id));
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  const kept = previous
    .filter((a) => !freshIds.has(a.id) && new Date(a.pubDate).getTime() > cutoff)
    .map((a) => ({ ...a, excerpt: a.summary, aiInput: '' }));

  let merged = dedupe([...fresh, ...kept])
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ARTICLES);

  // 3. Résumés IA pour les nouveaux articles seulement (les plus récents d'abord)
  const todo = merged.filter((a) => !a.aiDone).slice(0, MAX_NEW_SUMMARIES);
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
  if (hasKey && todo.length) {
    let done = 0;
    let failStreak = 0;
    for (let i = 0; i < todo.length; i += 2) {
      const before = done;
      await Promise.all(
        todo.slice(i, i + 2).map(async (a) => {
          const r = await aiSummarize(a);
          if (r) {
            a.summary = r.summary;
            a.keywords = r.keywords;
            a.aiDone = true;
            done++;
          }
        })
      );
      // Quota Google atteint : on s'arrête, les articles restants seront résumés au prochain passage.
      failStreak = done === before ? failStreak + 1 : 0;
      if (failStreak >= 2) { console.log('⏸️ Quota IA atteint : suite au prochain passage.'); break; }
      await sleep(2500);
    }
    console.log(`🤖 ${done}/${todo.length} résumés IA générés`);
  }

  // 4. Sortie propre (sans champs internes)
  const out = merged.map(({ id, title, source, category, url, pubDate, summary, keywords, aiDone, coverage, also }) => ({
    id, title, source, category, url, pubDate, summary, keywords, aiDone, coverage, also,
  }));

  const changed = JSON.stringify(out) !== JSON.stringify(previous);
  if (changed) {
    await writeJson(OUT, out);
    meta.updatedAt = nowIso;
    meta.articles = out.length;
  }
  meta.feedsOk = okCount;
  meta.feedsTotal = feeds.length;
  await writeJson(META, meta);
  console.log(`✅ ${out.length} articles (${changed ? 'mis à jour' : 'inchangé'}), ${okCount}/${feeds.length} flux OK`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
