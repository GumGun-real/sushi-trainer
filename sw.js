// sw.js — офлайн-кэш для тренажёра меню
const CACHE_NAME = 'sushi-trainer-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './kitchen.html',
  './style.css',
  './app.js',
  './menu.json',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Стратегия: сначала кэш, потом сеть; при сети кладём ответ в кэш (чтобы картинки тоже закэшировались)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  if (event.request.mode === 'navigate' || /\.(html|js|css|json)$/.test(u.pathname)) {
    // код и данные: сначала сеть, чтобы обновления доходили сразу
    event.respondWith(fetch(event.request).then((r) => {
      if (r && r.ok && u.origin === location.origin) { const c = r.clone(); caches.open(CACHE_NAME).then((ca) => ca.put(event.request, c)); }
      return r;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.ok && new URL(event.request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
