/* Configuration de LUMen — les seules valeurs à modifier pour brancher les services. */
window.LUMEN = {
  SITE_URL: 'https://jikeltech.netlify.app',

  // Données : le JSON est lu directement sur GitHub (mis à jour toutes les 30 min sans redéployer Netlify).
  ARTICLES_URL: 'https://raw.githubusercontent.com/jikel-tech/lumen-site/main/data/articles.json',
  WEEKLY_URL: 'https://raw.githubusercontent.com/jikel-tech/lumen-site/main/data/weekly.json',
  // Copies locales utilisées si GitHub est injoignable.
  ARTICLES_FALLBACK_URL: 'data/articles.json',
  WEEKLY_FALLBACK_URL: 'data/weekly.json',

  // Google Analytics 4 — remplace par ton ID de mesure (format G-XXXXXXXXXX). Tant que c'est le
  // placeholder, aucun script Google Analytics n'est chargé.
  GA_ID: 'G-VCB11QH2MV',

  // Notifications push (OneSignal) — colle ton App ID. Vide = le bouton cloche reste caché.
  ONESIGNAL_APP_ID: '',

  // Newsletter : fonction Netlify (netlify/functions/newsletter.js) + formulaire Brevo de secours.
  NEWSLETTER_API: '/.netlify/functions/newsletter',
  BREVO_FORM_URL: 'https://36ccc29d.sibforms.com/v2/serve/MUIFAPA6GPUh8MPA4n-IWHyqbVif8Vwk40sN-mMcFK9NXBz9m_CW4htdwFzTfAQ1z4fCWB6KWlhCliIVlW-7N9qRg5bZF1hFaLNf5-nA-UQ-H_kc8_xXGI9VM7acFVhGOEtWNnP4Sfr-DbV4A2No7GkhB2LARxgE1PRU52YcOFsZOANROxpH4EgZgCh21JQhcDtCcrJpT7_hogdQHQ==',

  CONTACT_EMAIL: 'arthurdjeu@gmail.com',
};
