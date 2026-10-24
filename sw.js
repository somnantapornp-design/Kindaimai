/* =========================================================================
   Service worker ของแอป "กินได้ไหม?" — ทำให้แอปเปิดได้แม้ไม่มีอินเทอร์เน็ต

   สำคัญสำหรับเจ้าของแอป:
   ทุกครั้งที่แก้ไฟล์ใดก็ตามในเว็บไซต์ (config.js, foods.json, หน้าเว็บ ฯลฯ)
   ให้เพิ่มเลข CACHE_VERSION ด้านล่าง เช่น 'v1' → 'v2'
   ผู้ใช้เดิมจะเห็นแถบ "มีเวอร์ชันใหม่ — แตะเพื่ออัปเดต"
   ========================================================================= */
const CACHE_VERSION = 'v4';

const APP_CACHE = 'kdm-app-' + CACHE_VERSION;
const FONT_CACHE = 'kdm-fonts';          // Google Fonts (kept across versions)

// App shell + data + icons, relative to this file so any sub-folder works
const PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/legal.js',
  './data/foods.json',
  './manifest.webmanifest',
  './privacy.html',
  './terms.html',
  './404.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/pet-dog.jpg',
  './icons/pet-cat.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
  // No skipWaiting here: the page shows an "update" bar and asks first.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('kdm-app-') && k !== APP_CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

// Stale-while-revalidate: answer from cache immediately, refresh in background
function staleWhileRevalidate(event, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(event.request, { ignoreSearch: cacheName === APP_CACHE }).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
        return res;
      }).catch(() => cached);
      if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
      return network;
    })
  );
}

// Network-first with a timeout, falling back to the cache
function networkFirst(request, fallbackUrl, timeoutMs) {
  return caches.open(APP_CACHE).then((cache) => {
    const fromCache = () => cache.match(request, { ignoreSearch: true })
      .then((r) => r || (fallbackUrl ? cache.match(fallbackUrl) : undefined))
      .then((r) => r || Response.error());
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        fromCache().then((r) => { if (!settled && r.type !== 'error') { settled = true; resolve(r); } });
      }, timeoutMs);
      fetch(request).then((res) => {
        clearTimeout(timer);
        if (res && res.ok) cache.put(request, res.clone());
        if (!settled) { settled = true; resolve(res); }
      }).catch(() => {
        clearTimeout(timer);
        if (!settled) { settled = true; fromCache().then(resolve); }
      });
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // e.g. Google Forms POST: never touched
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    // Only Google Fonts are cached. LINE, Google Forms, source links: untouched.
    if (isFontRequest(url)) event.respondWith(staleWhileRevalidate(event, FONT_CACHE));
    return;
  }

  // Page navigations: network first, offline → cached page or the app shell
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html', 4000));
    return;
  }

  // Food data: prefer fresh data, but always work offline
  if (url.pathname.endsWith('/data/foods.json')) {
    event.respondWith(networkFirst(req, null, 4000));
    return;
  }

  // CSS / JS / icons / manifest
  event.respondWith(staleWhileRevalidate(event, APP_CACHE));
});
