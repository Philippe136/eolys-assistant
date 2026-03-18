const CACHE = 'vox-v2';
const SHELLS = ['/today', '/dashboard', '/record', '/projects', '/actions', '/settings', '/login'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Toujours réseau pour les appels API et OAuth
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Stale-while-revalidate pour les pages et assets statiques
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        });
        return cached || network;
      })
    )
  );
});
