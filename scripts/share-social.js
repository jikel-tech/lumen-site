// Partage automatique d'une actu sur la page Facebook et le compte X de JikelTech.
// Exécuté 3 fois par jour (workflow share-social.yml) : 1 publication par passage.
//
// Secrets GitHub (Settings → Secrets and variables → Actions) — chaque réseau est optionnel :
//   Facebook : FB_PAGE_ID, FB_PAGE_TOKEN        (jeton d'accès de PAGE, longue durée)
//   X        : X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET  (app avec droit "Lecture et écriture")
// Un réseau sans secrets est simplement ignoré. DRY_RUN=1 affiche les posts sans les envoyer.
//
// Le lien partagé est https://…/#a=<id> : il ouvre directement le résumé de l'actu sur JikelTech.

import { createHmac, randomBytes } from 'node:crypto';
import { DATA, SITE_URL, readJson, writeJson, score, readMixed } from './lib.js';

const DRY = process.env.DRY_RUN === '1';
const MAX_AGE_H = 18;
const KEEP_LOG = 300;

const firstSentences = (s, n) => ((String(s || '').match(/[^.!?]+[.!?]+(\s|$)/g) || [s || '']).slice(0, n).map((x) => x.trim()).join(' ').trim());

// ---------- X (OAuth 1.0a, signature HMAC-SHA1) ----------
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function oauthHeader(method, url, { key, secret, token, tokenSecret }) {
  const p = {
    oauth_consumer_key: key,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const paramStr = Object.keys(p).sort().map((k) => `${enc(k)}=${enc(p[k])}`).join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join('&');
  p.oauth_signature = createHmac('sha1', `${enc(secret)}&${enc(tokenSecret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.keys(p).sort().map((k) => `${enc(k)}="${enc(p[k])}"`).join(', ');
}

function xText(a, link) {
  // Les liens comptent pour 23 caractères sur X, quelle que soit leur longueur.
  const room = 280 - 23 - 2;
  let body = a.title;
  const extra = firstSentences(a.summary, 1);
  if (extra && (body + '\n\n' + extra).length <= room) body += '\n\n' + extra;
  if (body.length > room) body = body.slice(0, room - 1).trimEnd() + '…';
  return `${body}\n${link}`;
}

async function uploadXMedia(imageUrl, creds) {
  const img = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!img.ok) throw new Error('image HTTP ' + img.status);
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length > 4_500_000) throw new Error('image trop lourde');
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const fd = new FormData();
  fd.append('media', new Blob([buf]), 'actu.jpg');
  const res = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url, creds) }, body: fd, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`X media HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
  return (await res.json()).media_id_string;
}

async function postX(a, link) {
  const creds = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
  if (!Object.values(creds).every(Boolean)) return { skipped: true };
  const text = xText(a, link);
  if (DRY) { console.log('--- X (simulation) ---\n' + text + '\nPhoto : ' + (imgOk(a.image) ? a.image : '(aucune)')); return { ok: true, dry: true }; }
  const payload = { text };
  if (imgOk(a.image)) {
    try { payload.media = { media_ids: [await uploadXMedia(a.image, creds)] }; }
    catch (err) { console.error('Photo X ignorée, tweet sans photo :', err.message); }
  }
  const url = 'https://api.twitter.com/2/tweets';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: oauthHeader('POST', url, creds), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`X HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

// ---------- Facebook (Page) ----------
const imgOk = (u) => /^https:\/\/(images\.pexels\.com|images\.unsplash\.com)\//.test(String(u || ''));

async function postFacebook(a, link) {
  const page = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!page || !token) return { skipped: true };
  const message = `${a.title}\n\n${firstSentences(a.summary, 2)}\n\n👉 ${link}\nJikelTech`.trim();
  if (DRY) { console.log('--- Facebook (simulation) ---\n' + message + '\nPhoto : ' + (imgOk(a.image) ? a.image : '(aucune, aperçu du lien)')); return { ok: true, dry: true }; }
  const call = async (edge, params) => {
    const res = await fetch(`https://graph.facebook.com/${encodeURIComponent(page)}/${edge}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: token }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Facebook ${edge} HTTP ${res.status} ${(await res.text()).replace(token, '***').slice(0, 200)}`);
  };
  // Avec photo : l'image de l'actu est publiée directement, le lien est dans le texte.
  if (imgOk(a.image)) {
    try { await call('photos', { url: a.image, caption: message }); return { ok: true }; }
    catch (err) { console.error('Photo refusée, publication du lien seul :', err.message); }
  }
  await call('feed', { message: `${a.title}\n\n${firstSentences(a.summary, 2)}\n\nJikelTech`.trim(), link });
  return { ok: true };
}

// ---------- Sélection ----------
async function main() {
  const articles = await readMixed();
  const state = await readJson(DATA('shared.json'), { ids: [], lastCategory: null, log: [] });
  const done = new Set(state.ids);
  const now = Date.now();

  const pool = articles
    .filter((a) => !done.has(a.id) && a.title && now - new Date(a.pubDate).getTime() < MAX_AGE_H * 3600_000)
    .sort((a, b) => score(b, now) - score(a, now));
  if (!pool.length) { console.log('Aucune actu récente à partager.'); return; }

  // On varie les rubriques d'un passage à l'autre.
  const pick = pool.find((a) => a.category !== state.lastCategory) || pool[0];
  const link = `${SITE_URL}/#a=${encodeURIComponent(pick.id)}`;
  console.log(`Actu choisie : [${pick.category}] ${pick.title}`);

  const results = {};
  for (const [name, fn] of [['facebook', postFacebook], ['x', postX]]) {
    try {
      const r = await fn(pick, link);
      results[name] = r.skipped ? 'ignoré (secrets absents)' : r.dry ? 'simulé' : 'publié';
    } catch (err) {
      results[name] = 'ERREUR';
      console.error(`${name} :`, err.message);
    }
  }
  console.log('Résultat :', results);

  const published = Object.values(results).includes('publié');
  if (published) {
    state.ids = [pick.id, ...state.ids].slice(0, KEEP_LOG);
    state.lastCategory = pick.category;
    state.log = [{ at: new Date().toISOString(), id: pick.id, title: pick.title, results }, ...(state.log || [])].slice(0, 50);
    await writeJson(DATA('shared.json'), state);
  }
  if (Object.values(results).includes('ERREUR')) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
