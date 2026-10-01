/* כמה | Service Worker */
const VERSION = 'kama-v1.0.0';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* דומיינים שלא נוגעים בהם: תמיד מהרשת (API חי ואריחי מפה) */
const BYPASS = [
  'api.openrouteservice.org',
  'v6.exchangerate-api.com',
  'tile.openstreetmap.org'
];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (BYPASS.some(h => url.hostname.endsWith(h))) return;      // נתוני זמן אמת, לא נשמרים

  // ניווטים: רשת תחילה, נפילה לקאש (תמיכה לא מקוונת)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(SHELL); c.put('./index.html', net.clone());
        return net;
      } catch {
        return (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // פונטים וספריות חיצוניות: החזרה מהקאש תוך רענון ברקע
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname.endsWith('unpkg.com')) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) caches.open(RUNTIME).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => null);
      return cached || (await net) || Response.error();
    })());
    return;
  }

  // משאבים מאותו מקור: קאש תחילה
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) { const c = await caches.open(SHELL); c.put(req, net.clone()); }
        return net;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});