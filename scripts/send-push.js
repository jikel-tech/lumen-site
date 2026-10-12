// Notification push quotidienne (OneSignal) : l'actu la plus importante des dernières 24 h.
// Exécuté chaque matin (workflow push-morning.yml).
//
// Secrets GitHub : ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY. Sans eux, le script ne fait rien.
// DRY_RUN=1 affiche la notification sans l'envoyer.

import { DATA, SITE_URL, readJson, writeJson, score, CAT_LABELS } from './lib.js';

const DRY = process.env.DRY_RUN === '1';

async function main() {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) { console.log('OneSignal non configuré : aucune notification envoyée.'); return; }

  const articles = await readJson(DATA('articles.json'), []);
  const state = await readJson(DATA('pushed.json'), { ids: [] });
  const now = Date.now();
  const pick = articles
    .filter((a) => !state.ids.includes(a.id) && now - new Date(a.pubDate).getTime() < 24 * 3600_000)
    .sort((a, b) => score(b, now) - score(a, now))[0];
  if (!pick) { console.log('Aucune actu récente à notifier.'); return; }

  const payload = {
    app_id: appId,
    target_channel: 'push',
    included_segments: ['Total Subscriptions'],
    headings: { fr: `LUMen · ${CAT_LABELS[pick.category] || 'Tech'}`, en: `LUMen · ${CAT_LABELS[pick.category] || 'Tech'}` },
    contents: { fr: pick.title, en: pick.title },
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
  state.ids = [pick.id, ...state.ids].slice(0, 200);
  await writeJson(DATA('pushed.json'), state);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
