// Service worker (round 4, "Add to home screen"). It keeps the app's own files so the app opens without signal.
// Network first: online, every file is fetched from the server (revalidated, so a new push shows on the next
// online load) and the copy in the cache is updated; with no signal, the cached copy is used.
// Only this app's own files are handled; nothing from other sites is fetched or cached.
// tools/check.mjs checks that FILES lists every file the app loads.

const CACHE = 'taimaka-stock-v1';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css',
  'css/tm.css',
  'css/app.css',
  'fonts/atkinson-hyperlegible-400.woff2',
  'fonts/atkinson-hyperlegible-700.woff2',
  'Assets/taimaka-logo.svg',
  'Assets/icon-192.png',
  'Assets/icon-512.png',
  'Assets/apple-touch-icon.png',
  'data/Facility list.csv',
  'data/ITP item list.csv',
  'data/ODK OTP usage Jan-Oct 2026.csv',
  'js/actions.js',
  'js/alerts.js',
  'js/app-data.js',
  'js/config.js',
  'js/csv.js',
  'js/db.js',
  'js/facilities.js',
  'js/format.js',
  'js/items.js',
  'js/kpis.js',
  'js/ledger.js',
  'js/seed.js',
  'js/stock.js',
  'js/storage.js',
  'js/time.js',
  'js/usage.js',
  'js/users.js',
  'js/ui/dom.js',
  'js/ui/main.js',
  'js/ui/parts.js',
  'js/ui/views/count.js',
  'js/ui/views/facility.js',
  'js/ui/views/history.js',
  'js/ui/views/logistics.js',
  'js/ui/views/management.js',
  'js/ui/views/settings.js',
  'js/ui/views/signin.js',
  'js/ui/views/supervisor.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(encodeURI(f), { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // other sites: not handled
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) await cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = await cache.match('./') || await cache.match('index.html');
        if (page) return page;
      }
      throw err;
    }
  })());
});
