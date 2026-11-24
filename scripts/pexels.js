// Photos d'illustration Pexels (gratuites, libres d'usage) pour les cartes d'actus.
// 1) Si l'IA a proposé une recherche photo précise pour l'article (champ photoQuery, ex. « microchip close up »),
//    on cherche cette scène en priorité.
// 2) Sinon, ou si la recherche ne donne rien : photos génériques de la rubrique (« smartphone », « artificial intelligence »…).
// Les résultats de chaque recherche sont gardés 7 jours (data/pexels-pool.json) pour économiser le quota Pexels.
// Ce sont des photos d'ambiance, pas la vraie image de l'actu.
// Clé : secret GitHub PEXELS_API_KEY (ou PEXEL_API_KEY). Sans clé ou en cas d'erreur : rien ne change,
// le site garde ses visuels dessinés.

import { DATA, readJson, writeJson } from './lib.js';

const KEY = () => process.env.PEXELS_API_KEY || process.env.PEXEL_API_KEY || '';
const UKEY = () => process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY || '';
const TTL_MS = 7 * 86400_000;
const PRUNE_MS = 21 * 86400_000;
const PER_QUERY = 30;       // recherches de rubrique (réutilisées par beaucoup d'articles)
const PER_SPECIFIC = 15;    // recherches propres à un article
const MAX_SEARCHES_PER_RUN = 20;

const QUERIES = {
  smartphones: ['smartphone', 'mobile phone hands', 'phone screen technology'],
  ia: ['artificial intelligence', 'robot technology', 'futuristic technology abstract'],
  logiciels: ['software developer coding', 'laptop work technology', 'computer screen code'],
  culture: ['video games', 'streaming entertainment', 'digital lifestyle technology'],
  afrique: ['africa technology', 'african city skyline', 'african entrepreneur laptop'],
  default: ['technology', 'digital technology'],
};

// Wanda Info (actus du Cameroun) : une série d'ambiances par sous-rubrique.
const WANDA_QUERIES = {
  tech: ['africa technology', 'african entrepreneur laptop', 'mobile money africa'],
  educ: ['african students classroom', 'students studying books', 'university graduation africa'],
  finance: ['african market business', 'business meeting africa', 'banknotes calculator'],
  actus: ['african city street', 'africa people daily life', 'cameroon'],
  sport: ['football africa', 'african athletes running', 'soccer stadium crowd'],
  emploi: ['job interview office', 'african professional workplace', 'people working office'],
  sante: ['hospital africa', 'doctor stethoscope', 'medical health care'],
  culture: ['african culture music', 'african art colorful', 'traditional african fabric'],
  default: ['african city skyline', 'africa people daily life'],
};

const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; };
const generic = (a) => (a.category === 'wanda' ? WANDA_QUERIES[a.sub] || WANDA_QUERIES.default : QUERIES[a.category] || QUERIES.default);
const genericQuery = (a) => { const qs = generic(a); return qs[hash(a.id) % qs.length]; };
// Recherche propre à l'article : texte court, lettres et chiffres seulement (jamais de marque seule : l'IA a l'instruction de décrire une scène).
const specificQuery = (a) => (typeof a.photoQuery === 'string' && /^[a-z0-9][a-z0-9 \-]{2,40}$/i.test(a.photoQuery.trim()) ? a.photoQuery.trim().toLowerCase() : '');

// Unsplash : complément facultatif (secret UNSPLASH_ACCESS_KEY). Les images restent chargées depuis leur serveur (images.unsplash.com),
// avec le nom du photographe et le lien vers la photo, comme l'exige Unsplash.
async function searchUnsplash(query, perPage) {
  const key = UKEY();
  if (!key) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${Math.min(perPage, 30)}&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .map((p) => ({ url: p.urls?.regular, by: p.user?.name || '', page: p.links?.html ? `${p.links.html}?utm_source=jikeltech&utm_medium=referral` : '' }))
    .filter((p) => typeof p.url === 'string' && p.url.startsWith('https://images.unsplash.com/'));
}

async function search(query, key, perPage) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&size=medium`;
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const data = await res.json();
  return (data.photos || [])
    .map((p) => ({ url: p.src?.large, by: p.photographer || '', page: p.url || '' }))
    .filter((p) => typeof p.url === 'string' && p.url.startsWith('https://images.pexels.com/'));
}

// Donne une photo à chaque article qui n'en a pas encore. Renvoie le nombre de photos attribuées.
export async function attachPhotos(articles) {
  const key = KEY();
  if (!key) { console.log('📷 Pexels : pas de clé, visuels dessinés conservés.'); return 0; }

  const file = DATA('pexels-pool.json');
  const pool = await readJson(file, {});
  let poolChanged = false;
  let failed = false;
  let searches = 0;

  const isFresh = (q) => pool[q] && Date.now() - new Date(pool[q].at).getTime() < TTL_MS;
  const need = (q, perPage) => ({ q, perPage });

  // Recherches à faire : d'abord les scènes précises des articles sans photo, puis les rubriques.
  const todo = new Map();
  for (const a of articles) {
    if (a.image) continue;
    const s = specificQuery(a);
    if (s && !isFresh(s)) todo.set(s, need(s, PER_SPECIFIC));
  }
  for (const a of articles) {
    if (a.image) continue;
    const g = genericQuery(a);
    if (!isFresh(g) && !todo.has(g)) todo.set(g, need(g, PER_QUERY));
  }

  for (const { q, perPage } of todo.values()) {
    if (failed || searches >= MAX_SEARCHES_PER_RUN) break;
    try {
      searches++;
      let photos = await search(q, key, perPage);
      if (photos.length < 3) { try { photos = [...photos, ...(await searchUnsplash(q, perPage))]; } catch (err) { console.error('📷 Unsplash :', err.message); } }
      pool[q] = { at: new Date().toISOString(), photos }; // même vide : évite de refaire la recherche à chaque passage
      poolChanged = true;
    } catch (err) {
      console.error('📷 Pexels :', err.message);
      failed = true; // on s'arrête (quota ou panne) : réessai au prochain passage
    }
  }
  if (poolChanged) {
    for (const [q, v] of Object.entries(pool)) if (Date.now() - new Date(v.at).getTime() > PRUNE_MS) delete pool[q];
    await writeJson(file, pool);
  }

  const used = new Set(articles.filter((a) => a.image).map((a) => a.image));
  let n = 0, precise = 0;
  for (const a of articles) {
    if (a.image) continue;
    const s = specificQuery(a);
    let photos = s ? pool[s]?.photos : null;
    const isPrecise = !!photos?.length;
    if (!isPrecise) photos = pool[genericQuery(a)]?.photos;
    if (!photos?.length) continue;
    let pick = null;
    for (let i = 0; i < photos.length; i++) {
      const p = photos[(hash(a.id + 'p') + i) % photos.length];
      if (!used.has(p.url)) { pick = p; break; }
    }
    pick = pick || photos[hash(a.id + 'p') % photos.length];
    a.image = pick.url; a.imageBy = pick.by; a.imagePage = pick.page;
    used.add(pick.url);
    n++;
    if (isPrecise) precise++;
  }
  if (n) console.log(`📷 ${n} photos Pexels attribuées (${precise} selon le sujet de l'article, ${searches} recherche${searches > 1 ? 's' : ''})`);
  return n;
}
