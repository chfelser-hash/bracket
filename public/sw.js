// Service Worker: macht Bracket installierbar. Oberfläche zuerst aus dem Netz (immer aktuell),
// bei Ausfall aus dem Cache. API-Aufrufe gehen immer ans Netz – Resultate brauchen den Server.
const SHELL = 'bracket-shell-__VERSION__'; // setzt der Server (Version aus package.json)
const ASSETS = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
  '/js/app.js', '/js/ui.js', '/js/turnier.js',
  '/js/views/jetzt.js', '/js/views/plan.js', '/js/views/tabellen.js', '/js/views/setup.js', '/js/views/tv.js', '/js/views/score.js', '/js/views/shared.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  );
});
