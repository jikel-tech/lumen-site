// Photos d'illustration Pexels (gratuites, libres d'usage) pour les cartes d'actus.
// Principe : pour chaque rubrique, quelques recherches génériques ("smartphone", "intelligence artificielle"…)
// sont faites UNE FOIS puis gardées en cache 7 jours (data/pexels-pool.json). Chaque article reçoit une photo
// de sa rubrique, différente de celles des autres. Ce sont des photos d'ambiance, pas la vraie image de l'actu.
// Clé : secret GitHub PEXELS_API_KEY (ou PEXEL_API_KEY). Sans clé ou en cas d'erreur : rien ne change,
// le site garde ses visuels dessinés.

import { DATA, readJson, writeJson } from './lib.js';

const KEY = () => process.env.PEXELS_API_KEY || process.env.PEXEL_API_KEY || '';
const TTL_MS = 7 * 86400_000;
const PER_QUERY = 30;

const QUERIES = {
  smartphones: ['smartphone', 'mobile phone hands', 'phone screen technology'],
  ia: ['artificial intelligence', 'robot technology', 'futuristic technology abstract'],
  logiciels: ['software developer coding', 'laptop work technology', 'computer screen code'],
  culture: ['video games', 'streaming entertainment', 'digital lifestyle technology'],
  afrique: ['africa technology', 'african city skyline', 'african entrepreneur laptop'],
  default: ['technology', 'digital technology'],
};

const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; };
const queriesFor = (cat) => QUERIES[cat] || QUERIES.default;

async function search(query, key) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_QUERY}&orientation=landscape&size=medium`;
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

  const needed = new Set();
  for (const a of articles) if (!a.image) needed.add(queriesFor(a.category)[hash(a.id) % queriesFor(a.category).length]);

  for (const q of needed) {
    const fresh = pool[q] && Date.now() - new Date(pool[q].at).getTime() < TTL_MS && pool[q].photos?.length;
    if (fresh || failed) continue;
    try {
      const photos = await search(q, key);
      if (photos.length) { pool[q] = { at: new Date().toISOString(), photos }; poolChanged = true; }
    } catch (err) {
      console.error('📷 Pexels :', err.message);
      failed = true; // on s'arrête (quota ou panne) : réessai au prochain passage
    }
  }
  if (poolChanged) await writeJson(file, pool);

  const used = new Set(articles.filter((a) => a.image).map((a) => a.image));
  let n = 0;
  for (const a of articles) {
    if (a.image) continue;
    const qs = queriesFor(a.category);
    const photos = pool[qs[hash(a.id) % qs.length]]?.photos;
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
  }
  if (n) console.log(`📷 ${n} photos Pexels attribuées`);
  return n;
}
