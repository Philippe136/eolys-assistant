const CACHE      = 'vox-v26';
const FONT_CACHE = 'vox-fonts-v1';
const QUEUE_DB   = 'vox-offline-queue';

const SHELLS = [
  '/today', '/dashboard', '/record', '/projects', '/actions', '/settings',
  '/gmail', '/context', '/patterns', '/radar', '/folders', '/finance',
  '/app.css', '/app.js', '/manifest.json',
  '/icon-192.png', '/apple-touch-icon.png',
];

// ── IndexedDB helpers ──────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function enqueue(item) {
  const db    = await openDB();
  const tx    = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  return new Promise((resolve, reject) => {
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dequeueAll() {
  const db    = await openDB();
  const tx    = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = async () => {
      const items = req.result;
      store.clear();
      resolve(items);
    };
    req.onerror = e => reject(e.target.error);
  });
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // POST /api/ingest → intercepter pour queue offline
  if (url.pathname === '/api/ingest' && e.request.method === 'POST') {
    e.respondWith(handleIngestOffline(e.request.clone()));
    return;
  }

  // Toujours réseau pour les autres appels API
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Cache-first longue durée pour les fonts Google
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Stale-while-revalidate pour les pages et assets statiques
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        return cached || network;
      })
    )
  );
});

async function handleIngestOffline(request) {
  try {
    // Essayer réseau d'abord
    const res = await fetch(request);
    return res;
  } catch {
    // Offline → extraire le body JSON et mettre en queue
    try {
      const body = await request.json();
      await enqueue({ url: request.url, body, timestamp: Date.now() });
      // Notifier le client
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'QUEUED_OFFLINE', text: body.text }));
      return new Response(JSON.stringify({ queued: true, message: 'Note sauvegardée hors ligne. Sera envoyée à la reconnexion.' }), {
        status: 202, headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Hors ligne — impossible de sauvegarder.' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}

// ── Sync offline queue au retour réseau ───────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'sync-queue') {
    e.waitUntil(syncQueue());
  }
});

async function syncQueue() {
  const items = await dequeueAll();
  const results = await Promise.allSettled(
    items.map(item =>
      fetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      })
    )
  );
  const synced = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  if (synced > 0) {
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'SYNC_DONE', count: synced }));
  }
}

// ── Push notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Vox', {
      body:  data.body  || '',
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      tag:   data.tag   || 'vox-notif',
      data:  { url: data.url || '/today' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/today';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
