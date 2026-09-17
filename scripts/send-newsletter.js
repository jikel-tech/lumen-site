// Script d'envoi de la newsletter quotidienne LUMen
// Lit les 3 actus les plus récentes dans data/articles.json et les envoie
// via une campagne Brevo à la liste des abonnés. Exécuté une fois par jour
// par GitHub Actions.
//
// Usage local : BREVO_API_KEY=xxx node scripts/send-newsletter.js

import { readFile } from 'node:fs/promises';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const LIST_ID = 2; // ID de la liste d'abonnés LUMen sur Brevo
const SENDER_EMAIL = 'tilokendrick@gmail.com'; // expéditeur vérifié sur Brevo
const SENDER_NAME = 'LUMen';
const SITE_URL = 'https://jikeltech.netlify.app';

if (!BREVO_API_KEY) {
  console.error('❌ BREVO_API_KEY manquant — envoi annulé.');
  process.exit(1);
}

function formatDateFR() {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function buildHtml(articles) {
  const rows = articles.map((a) => `
    <tr>
      <td style="padding:20px 0; border-bottom:1px solid #2a2a2a;">
        <div style="font-size:12px; color:#7FFFB0; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">${a.category} · ${a.source}</div>
        <div style="font-size:19px; font-weight:600; color:#ECE9DF; margin-bottom:10px; line-height:1.3;">${a.title}</div>
        <div style="font-size:14px; color:#B9B6AC; line-height:1.5; margin-bottom:12px;">${a.summary}</div>
        <a href="${a.url}" style="font-size:13px; color:#7FFFB0; text-decoration:none;">Lire l'article →</a>
      </td>
    </tr>`).join('');

  return `
  <div style="background:#0B0F0D; padding:32px 16px; font-family:Arial,sans-serif;">
    <div style="max-width:560px; margin:0 auto;">
      <div style="font-size:24px; font-weight:bold; color:#ECE9DF; margin-bottom:4px;">LUM<span style="color:#7FFFB0; font-style:italic;">en</span></div>
      <div style="font-size:13px; color:#B9B6AC; margin-bottom:28px;">Les 3 actus tech du ${formatDateFR()}</div>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <div style="margin-top:28px; text-align:center;">
        <a href="${SITE_URL}" style="display:inline-block; background:#7FFFB0; color:#0B0F0D; padding:12px 28px; border-radius:2px; text-decoration:none; font-weight:600; font-size:14px;">Voir toutes les actus sur LUMen</a>
      </div>
      <div style="margin-top:32px; font-size:11px; color:#666; text-align:center;">
        Vous recevez cet email car vous êtes inscrit à la newsletter LUMen.<br>
        {unsubscribe}
      </div>
    </div>
  </div>`;
}

async function main() {
  const raw = await readFile('../data/articles.json', 'utf-8');
  const articles = JSON.parse(raw);

  if (!articles.length) {
    console.log('Aucune actu disponible aujourd\'hui — envoi annulé.');
    return;
  }

  const top3 = articles
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 3);

  const htmlContent = buildHtml(top3);
  const subject = `LUMen — 3 actus tech du ${formatDateFR()}`;

  // 1. Créer la campagne
  const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      name: `LUMen quotidien — ${new Date().toISOString().slice(0, 10)}`,
      subject,
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      htmlContent,
      recipients: { listIds: [LIST_ID] },
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok) {
    console.error('❌ Échec de création de la campagne :', JSON.stringify(createData));
    process.exit(1);
  }

  const campaignId = createData.id;
  console.log(`✅ Campagne créée (id ${campaignId})`);

  // 2. Envoyer immédiatement
  const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendNow`, {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY },
  });

  if (sendRes.status === 204 || sendRes.ok) {
    console.log('✅ Newsletter envoyée avec succès.');
  } else {
    const errData = await sendRes.json().catch(() => ({}));
    console.error('❌ Échec de l\'envoi :', JSON.stringify(errData));
    process.exit(1);
  }
}

main();
