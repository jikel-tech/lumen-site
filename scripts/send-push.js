// Notification push (OneSignal) à chaque mise à jour des actus (toutes les 30 min, sauf la nuit) :
// la meilleure nouvelle actu, avec « +N autres » s'il y en a plusieurs. Workflow push-morning.yml.
//
// Secrets GitHub : ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY. Sans eux, le script ne fait rien.
// DRY_RUN=1 affiche la notification sans l'envoyer.

import { DATA, SITE_URL, readJson, writeJson, score, readMixed, labelOf } from './lib.js';

const DRY = process.env.DRY_RUN === '1';

async function main() {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) { console.log('OneSignal non configuré : aucune notification envoyée.'); return; }

  // Heures calmes (21 h - 6 h au Cameroun) : pas de notification la nuit, elles partiront au réveil.
  const hCm = (new Date().getUTCHours() + 1) % 24;
  if (process.env.QUIET !== '0' && (hCm >= 21 || hCm < 6) && !DRY) { console.log('Heures calmes : rien envoyé.'); return; }

  const articles = await readMixed();
  const state = await readJson(DATA('pushed.json'), { ids: [] });
  const now = Date.now();
  const fresh = articles
    .filter((a) => !state.ids.includes(a.id) && now - new Date(a.pubDate).getTime() < 24 * 3600_000)
    .sort((a, b) => score(b, now) - score(a, now));
  const pick = fresh[0];
  if (!pick) { console.log('Aucune nouvelle actu à notifier.'); return; }
  const more = fresh.length - 1;
  const sfx = (l) => (more > 0 ? (l === 'fr' ? ` (+${more} autre${more > 1 ? 's' : ''})` : ` (+${more} more)`) : '');

  const payload = {
    app_id: appId,
    target_channel: 'push',
    included_segments: ['Total Subscriptions'],
    headings: { fr: `JikelTech · ${labelOf(pick)}`, en: `JikelTech · ${labelOf(pick)}` },
    contents: { fr: pick.title + sfx('fr'), en: (pick.titleEn || pick.title) + sfx('en') },
    url: `${SITE_URL}/#a=${encodeURIComponent(pick.id)}`,
  };
  if (DRY) { console.log('--- Notification (simulation) ---\n' + JSON.stringify(payload, null, 2)); return; }

  const res = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OneSignal HTTP ${res.status} ${text.slice(0, 300)}`);
  console.log('🔔 Notification envoyée :', pick.title);
  state.ids = [...fresh.map((a) => a.id), ...state.ids].slice(0, 400);
  await writeJson(DATA('pushed.json'), state);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
