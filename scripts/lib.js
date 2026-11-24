// Utilitaires partagés par les scripts JikelTech (Node 18+).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = (name) => path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), name);
export const SITE_URL = process.env.SITE_URL || 'https://jikeltech.netlify.app';

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(file, data) {
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// N'autorise que http(s) : évite les liens "javascript:" venant d'un flux RSS.
export function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

// Modèles Gemini. "gemini-2.5-flash" n'est plus accessible aux clés récentes (erreur 404) : voir
// https://ai.google.dev/gemini-api/docs/models. Résumés courts → modèle économique ;
// texte long (analyse hebdomadaire) → modèle plus capable. GEMINI_MODEL force un modèle précis.
const MODEL_SHORT = 'gemini-3.5-flash-lite';
const MODEL_LONG = 'gemini-3.8-flash';
let geminiErrors = 0;

// Appel à Gemini avec réponse texte libre. Renvoie null si pas de clé ou en cas d'erreur.
export async function gemini(prompt, { json = false, maxOutputTokens = 1024, temperature = 0.4 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || (maxOutputTokens >= 2000 ? MODEL_LONG : MODEL_SHORT);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          // Les nouveaux modèles "réfléchissent" un peu avant de répondre, et ces tokens comptent dans
          // la limite : on garde de la marge pour que la réponse ne soit pas coupée.
          maxOutputTokens: maxOutputTokens + 2000,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      // On détaille seulement les 2 premières erreurs pour garder un journal lisible.
      if (geminiErrors++ < 2) console.error(`Gemini HTTP ${res.status} (modèle ${model}) : ${(await res.text()).replace(key, '***').slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || null;
  } catch (err) {
    if (geminiErrors++ < 2) console.error('Gemini indisponible :', err.message);
    return null;
  }
}

// -----------------------------------------------------------------------
// Chaîne d'IA de secours : Gemini d'abord, puis (si pas de clé / quota atteint / erreur) Groq, Mistral,
// OpenRouter, NVIDIA, Anthropic. Chaque fournisseur n'est utilisé que si sa clé existe dans les secrets.
// Les modèles sont modifiables sans toucher au code (variables GROQ_MODEL, MISTRAL_MODEL, etc.).
// -----------------------------------------------------------------------
const env = (...names) => names.map((n) => process.env[n]).find(Boolean) || '';

const COMPAT = [
  { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', json: true,
    key: () => env('GROQ_API_KEY', 'GROQ_IA_API_KEY'), model: () => env('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    prefer: [/llama-3\.3-70b/, /gpt-oss-120b/, /llama.*70b/, /gpt-oss-20b/, /qwen.*(32b|3)/, /llama.*(8b|instant)/],
    skip: /whisper|guard|tts|orpheus|playai|vision|compound|distil|embed/ },
  { name: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', json: true,
    key: () => env('MISTRAL_API_KEY', 'MISTRAL_IA_API_KEY', 'MISTRAL_AI_API_KEY', 'MISTRAL_KEY'), model: () => env('MISTRAL_MODEL') || 'mistral-small-latest',
    prefer: [/mistral-small/, /mistral-medium/, /mistral-large/, /ministral/], skip: /embed|moderation|ocr|codestral|pixtral|voxtral/ },
  { name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', json: false,
    key: () => env('OPENROUTER_API_KEY', 'OPENROUTER_IA_API_KEY', 'OPENROUTE_IA_API_KEY'), model: () => env('OPENROUTER_MODEL') || 'meta-llama/llama-3.3-70b-instruct:free',
    only: /:free$/, prefer: [/llama-3\.3-70b/, /gpt-oss-120b/, /mistral.*(small|large)/, /qwen.*(72b|235b|32b)/, /gemma.*(27b|3)/, /deepseek/, /llama/],
    skip: /vision|image|-vl|coder|embed|moderation|guard|audio|lyria/ },
  { name: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions', json: false,
    key: () => env('NVIDIA_API_KEY', 'NVIDIA_IA_API_KEY'), model: () => env('NVIDIA_MODEL') || 'meta/llama-3.3-70b-instruct',
    prefer: [/llama-3\.3-70b-instruct/, /llama-3\.1-70b-instruct/, /mistral-(large|small|medium)/, /nemotron.*(70b|super)/, /qwen.*instruct/, /llama.*instruct/],
    skip: /embed|vision|-vl|guard|reward|safety|rerank|code|nv-|clip|parse/ },
];

const errCount = {};
function logErr(name, msg) {
  if ((errCount[name] = (errCount[name] || 0) + 1) <= 2) console.error(`${name} : ${msg}`.slice(0, 350));
}

// Les noms de modèles changent vite : si le modèle par défaut n'existe plus (erreur 404/400), on lit la liste
// officielle du fournisseur (GET /models) et on prend le premier modèle qui correspond à nos préférences.
const chosenModel = {};
const discovered = new Set();
async function discoverModel(p) {
  if (discovered.has(p.name)) return null;
  discovered.add(p.name);
  try {
    const res = await fetch(p.url.replace('/chat/completions', '/models'), {
      headers: { Authorization: `Bearer ${p.key()}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = (data?.data || []).map((m) => m.id).filter((id) => typeof id === 'string' && (!p.only || p.only.test(id)) && !(p.skip && p.skip.test(id)));
    for (const re of p.prefer) {
      const hit = ids.find((id) => re.test(id));
      if (hit) { console.log(`🔎 ${p.name} : modèle trouvé automatiquement → ${hit}`); return hit; }
    }
  } catch { /* ignoré */ }
  return null;
}

async function compatCall(p, prompt, { json, maxOutputTokens, temperature }, model = chosenModel[p.name] || p.model()) {
  const key = p.key();
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxOutputTokens + 1500, // marge : certains modèles « réfléchissent » avant de répondre
        temperature,
        ...(json && p.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const body = (await res.text()).replaceAll(key, '***');
      if ((res.status === 404 || res.status === 400) && !discovered.has(p.name)) {
        const alt = await discoverModel(p);
        if (alt && alt !== model) { chosenModel[p.name] = alt; return compatCall(p, prompt, { json, maxOutputTokens, temperature }, alt); }
      }
      logErr(p.name, `HTTP ${res.status} (modèle ${model}) ${body}`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    logErr(p.name, err.message);
    return null;
  }
}

async function anthropicCall(prompt, { maxOutputTokens, temperature }) {
  const key = env('ANTHROPIC_API_KEY');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env('ANTHROPIC_MODEL') || 'claude-haiku-5-5',
        max_tokens: maxOutputTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { logErr('anthropic', `HTTP ${res.status} ${(await res.text()).replaceAll(key, '***')}`); return null; }
    const data = await res.json();
    return data?.content?.[0]?.text?.trim() || null;
  } catch (err) {
    logErr('anthropic', err.message);
    return null;
  }
}

const PROVIDERS = [
  { name: 'gemini', has: () => !!env('GEMINI_API_KEY'), run: (pr, o) => gemini(pr, o) },
  ...COMPAT.map((p) => ({ name: p.name, has: () => !!p.key(), run: (pr, o) => compatCall(p, pr, o) })),
  { name: 'anthropic', has: () => !!env('ANTHROPIC_API_KEY'), run: (pr, o) => anthropicCall(pr, o) },
];

// Noms des fournisseurs dont la clé est présente (jamais les clés elles-mêmes).
export const aiProviders = () => PROVIDERS.filter((p) => p.has()).map((p) => p.name);

const strikes = {};
const benched = new Set(); // fournisseurs mis de côté jusqu'à la fin de ce passage (quota atteint, panne)
export const aiUsage = {};

// Essaie chaque fournisseur dans l'ordre. `accept(texte)` (facultatif) rejette une réponse inutilisable
// (ex. JSON invalide) : on passe alors au fournisseur suivant. Renvoie le texte, ou null si tout a échoué.
export async function llm(prompt, { json = false, maxOutputTokens = 1024, temperature = 0.4, accept } = {}) {
  const opts = { json, maxOutputTokens, temperature };
  for (const p of PROVIDERS) {
    if (!p.has() || benched.has(p.name)) continue;
    const text = await p.run(prompt, opts);
    if (text && (!accept || accept(text))) {
      strikes[p.name] = 0;
      aiUsage[p.name] = (aiUsage[p.name] || 0) + 1;
      return text;
    }
    if ((strikes[p.name] = (strikes[p.name] || 0) + 1) >= 3) {
      benched.add(p.name);
      console.log(`⏸️ ${p.name} mis de côté jusqu'à la fin de ce passage.`);
    }
  }
  return null;
}

export function frDate(d, opts = { dateStyle: 'long' }) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', ...opts }).format(new Date(d));
}

// Date "YYYY-MM-DD" à l'heure du Cameroun.
export function dayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala' }).format(new Date(d));
}

// Semaine ISO "YYYY-Www".
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Score "à la une" : sujets couverts par plusieurs sources + fraîcheur (même logique que le site).
export function score(a, now = Date.now()) {
  const ageH = (now - new Date(a.pubDate).getTime()) / 3600000;
  return (a.coverage || 1) * 2 + Math.max(0, 1 - ageH / 48) * 3 + (a.aiDone ? 0.3 : 0);
}

export const CAT_LABELS = {
  smartphones: 'Smartphones',
  ia: 'Intelligence artificielle',
  logiciels: 'Logiciels',
  culture: 'Culture numérique',
  afrique: 'Tech Afrique',
  wanda: 'Wanda Info',
};

export const WANDA_SUBS = { tech: 'Tech', educ: 'Éducation', finance: 'Finance', actus: 'Actus', sport: 'Sport', emploi: 'Emploi', sante: 'Santé', culture: 'Culture' };

// Étiquette d'une actu : « Wanda · Finance » pour les actus du Cameroun, sinon la rubrique.
export const labelOf = (a) => (a.category === 'wanda' && WANDA_SUBS[a.sub] ? `Wanda · ${WANDA_SUBS[a.sub]}` : CAT_LABELS[a.category] || 'Tech');

// Actus tech + actus du Cameroun (Wanda Info) mélangées.
export async function readMixed() {
  const main = await readJson(DATA('articles.json'), []);
  const wanda = await readJson(DATA('wanda.json'), []);
  return [...main, ...wanda];
}

// Coquille HTML commune aux pages statiques (archives du jour, analyses hebdomadaires).
export function pageShell({ title, description, path: p, body, jsonLd, noindex = false }) {
  const url = SITE_URL + p;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="icon" href="/icons/icon-192.png">
<meta property="og:site_name" content="JikelTech">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${SITE_URL}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<style>
:root{--ink:#0B0F0D;--ink2:#121814;--paper:#ECE9DF;--dim:#B9B6AC;--accent:#7FFFB0;--amber:#FFB25E;--line:rgba(236,233,223,.14)}
@media(prefers-color-scheme:light){:root{--ink:#F3F1EA;--ink2:#E9E6DC;--paper:#171512;--dim:#5C584E;--accent:#1F8A57;--amber:#B4661F;--line:rgba(23,21,18,.14)}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--ink);color:var(--paper);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}
a{color:var(--accent);text-underline-offset:3px}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
header{border-bottom:1px solid var(--line);padding:18px 0}
header .wrap{display:flex;justify-content:space-between;align-items:center;gap:16px}
.logo{font-family:Georgia,"Times New Roman",serif;font-size:1.4rem;color:var(--paper);text-decoration:none}.logo em{color:var(--accent)}
main{padding:36px 0 56px}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:clamp(1.7rem,4vw,2.4rem);line-height:1.2;margin-bottom:12px}
h2{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:1.4rem;margin:38px 0 14px}
h3{font-size:1.05rem;font-weight:600;line-height:1.35;margin-bottom:6px}
.lead{color:var(--dim);margin-bottom:8px}
.meta{font-size:.82rem;color:var(--dim)}
.item{padding:18px 0;border-top:1px solid var(--line)}
.item p{color:var(--dim);font-size:.95rem;margin-bottom:8px}
.kw{font-size:.76rem;color:var(--dim)}
.note{margin-top:36px;padding:16px;border:1px solid var(--line);background:var(--ink2);font-size:.85rem;color:var(--dim)}
footer{border-top:1px solid var(--line);padding:24px 0;font-size:.82rem;color:var(--dim)}
ul.days{list-style:none}ul.days li{padding:10px 0;border-top:1px solid var(--line)}
</style>
</head>
<body>
<header><div class="wrap"><a class="logo" href="/">Jikel<em>Tech</em></a><a href="/jour/">Archives</a></div></header>
<main><div class="wrap">
${body}
</div></main>
<footer><div class="wrap">© 2026 JikelTech, Kribi, Cameroun · <a href="/">Retour à l’actualité en direct</a></div></footer>
</body>
</html>
`;
}
