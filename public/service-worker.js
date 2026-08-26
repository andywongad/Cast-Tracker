/**
 * Offline shell, plus push.
 *
 * The app keeps everything in localStorage and calls itself local-first, and until now it still
 * needed the network to open — a plane, a lift, a bad hotel connection and your own library is
 * unreachable on the device it lives on. That mismatch is what this fixes.
 *
 * Runtime caching rather than a precache manifest: Vite hashes asset filenames per build, so a
 * static list in this file would be wrong the moment anything is deployed. Nothing here needs a
 * build step or a plugin.
 *
 * Three rules, by what each kind of request needs:
 *
 *   - navigations go to the network first, so a deploy is picked up the next time you open the app
 *     online, and fall back to the cached shell when there is no network at all.
 *   - hashed assets are cache-first. The hash IS the version, so a cached one can never be stale;
 *     serving it without asking the network is both faster and what makes offline work.
 *   - /api/* is never cached. TMDb lookups and bio generation are live calls, and a stale answer
 *     pretending to be fresh is worse than an honest failure.
 *
 * Images are cached with a cap. Without them an offline library shows initials where faces were,
 * which reads as data loss rather than as being offline.
 */

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const IMAGES = `images-${VERSION}`;
/** Bounded so a season of browsing can't fill the origin's storage quota. Oldest out first. */
const MAX_IMAGES = 300;

self.addEventListener('install', (event) => {
  // The shell is fetched rather than assumed: '/' is the only stable URL this app has.
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.add('/')).catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL && n !== IMAGES).map((n) => caches.delete(n))))
      // Taking control immediately matters here: the previous worker had no fetch handler at all,
      // so waiting for every tab to close would leave people online-only for another session.
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Live data only. A cached TMDb search would silently answer yesterday's question.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/', { cacheName: SHELL }).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request, { cacheName: SHELL }).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })),
    );
    return;
  }

  // Cast photos and posters. Opaque cross-origin responses cache fine and are what keep an offline
  // library recognisable.
  if (url.hostname === 'image.tmdb.org' || url.hostname.endsWith('tvmaze.com')) {
    event.respondWith(
      caches.match(request, { cacheName: IMAGES }).then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(IMAGES)
          .then((cache) => cache.put(request, copy))
          .then(() => trimCache(IMAGES, MAX_IMAGES))
          .catch(() => {});
        return response;
      }).catch(() => cached || Response.error())),
    );
  }
});

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/cast-tracker-icon.png',
      badge: '/cast-tracker-badge.png',
      tag: data.showId,
      requireInteraction: true,
      data: { showId: data.showId, url: data.url || '/' },
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
