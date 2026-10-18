/* Service worker LUMen : site installable (PWA) + lecture hors ligne de la dernière version vue.
   Il inclut aussi le worker OneSignal pour les notifications push (sans effet tant que OneSignal n'est pas configuré).
   Pense à changer VERSION quand tu modifies index.html, app.js ou style.css pour forcer la mise à jour du cache. */
const VERSION = 'lumen-v5';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'assets/style.css', 'assets/app.js', 'assets/config.js',
  'assets/categories/default.svg', 'assets/categories/smartphones.svg', 'assets/categories/ia.svg',
  'assets/categories/logiciels.svg', 'assets/categories/culture.svg', 'assets/categories/afrique.svg',
  'icons/icon-192.png',
];

try { importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'); } catch (e) { /* hors ligne ou bloqué : sans conséquence */ }

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // GitHub, Google, etc. : on ne touche pas
  if (url.pathname.startsWith('/.netlify/')) return; // fonctions serveur : jamais en cache

  // Pages : réseau d'abord, cache en secours
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // Code du site (JS, CSS, JSON) : réseau d'abord, pour que l'application installée soit toujours à jour
  if (/\.(js|css|json)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Le reste (icônes, visuels) : cache immédiat + mise à jour en arrière-plan
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
