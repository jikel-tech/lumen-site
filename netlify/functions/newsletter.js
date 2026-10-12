/* Fonction Netlify : inscription / désinscription à la newsletter via l'API Brevo.
   La clé Brevo reste côté serveur (variables d'environnement Netlify), jamais dans le site.

   Variables à définir dans Netlify (Site configuration → Environment variables) :
     BREVO_API_KEY            clé API Brevo (v3)
     BREVO_LIST_ID            numéro de la liste de contacts de la newsletter (nombre)
     BREVO_DOI_TEMPLATE_ID    (optionnel) ID du modèle d'email de confirmation → active la double confirmation
     BREVO_DOI_REDIRECT_URL   (optionnel) page affichée après confirmation (défaut : le site)
     SITE_URL                 (optionnel) défaut https://jikeltech.netlify.app

   Si BREVO_API_KEY ou BREVO_LIST_ID manque, la fonction répond 501 et le site retombe
   automatiquement sur le formulaire Brevo hébergé. */

const BREVO = 'https://api.brevo.com/v3';
const SITE = (process.env.SITE_URL || 'https://jikeltech.netlify.app').replace(/\/$/, '');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

// Limite basique par IP (en mémoire : valable tant que l'instance est "chaude", suffit contre les rafales).
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 500) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 250) break; }
  return arr.length > 6;
}

function originAllowed(origin) {
  if (!origin) return true; // appels sans en-tête Origin (ex. tests) : on laisse, les autres garde-fous restent actifs
  try {
    const { hostname, origin: o } = new URL(origin);
    return o === SITE || hostname.endsWith('.netlify.app') || hostname === 'localhost';
  } catch {
    return false;
  }
}

async function brevo(path, method, payload) {
  const res = await fetch(BREVO + path, {
    method,
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { /* corps vide (204) */ }
  return { status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Méthode non autorisée.' });

  const key = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!key || !listId) return json(501, { error: 'Newsletter non configurée sur le serveur.' });

  const h = event.headers || {};
  if (!originAllowed(h.origin || h.Origin)) return json(403, { error: 'Origine non autorisée.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Requête invalide.' }); }
  const { action, email, website, elapsed } = body;

  // Piège anti-robots : le champ "website" est invisible pour les humains. On fait semblant de réussir.
  if (website) return json(200, { ok: true });
  // Un humain met plus de 2 s à saisir son email.
  if (typeof elapsed === 'number' && elapsed < 2000) return json(429, { error: 'Trop rapide, réessaie dans un instant.' });

  const ip = h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  if (tooMany(ip)) return json(429, { error: 'Trop de tentatives, réessaie dans quelques minutes.' });

  if (action !== 'subscribe' && action !== 'unsubscribe') return json(400, { error: 'Action inconnue.' });
  const mail = String(email || '').trim().toLowerCase();
  if (mail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return json(400, { error: 'Adresse email invalide.' });

  try {
    if (action === 'subscribe') {
      const doi = Number(process.env.BREVO_DOI_TEMPLATE_ID);
      if (doi) {
        const r = await brevo('/contacts/doubleOptinConfirmation', 'POST', {
          email: mail,
          includeListIds: [listId],
          templateId: doi,
          redirectionUrl: process.env.BREVO_DOI_REDIRECT_URL || SITE,
        });
        if (r.status >= 400) throw new Error(`Brevo DOI ${r.status}`);
        return json(200, { ok: true, pending: true });
      }
      const r = await brevo('/contacts', 'POST', { email: mail, listIds: [listId], updateEnabled: true });
      if (r.status >= 400 && r.data?.code !== 'duplicate_parameter') throw new Error(`Brevo ${r.status}`);
      return json(200, { ok: true });
    }

    // Désinscription : on retire le contact de la liste. Réponse identique que l'adresse soit
    // présente ou non, pour ne pas révéler qui est inscrit.
    const r = await brevo(`/contacts/lists/${listId}/contacts/remove`, 'POST', { emails: [mail] });
    if (r.status >= 500) throw new Error(`Brevo ${r.status}`);
    return json(200, { ok: true });
  } catch (err) {
    console.error('newsletter:', err.message);
    return json(502, { error: 'Le service de newsletter est momentanément indisponible, réessaie plus tard.' });
  }
};
