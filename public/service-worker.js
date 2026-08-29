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

/**
 * The day and time an episode airs, in the reader's own timezone.
 *
 * A COPY. src/lib/airTime.ts holds the canonical version and the alert card uses it; this file is
 * served verbatim and cannot import from the bundle, which is why the logic is repeated rather
 * than shared. src/lib/airTime.test.ts runs both through the same table and fails if they
 * disagree — so change both, or the suite will say so.
 *
 * Formatted here rather than in the cron because this is the only code in the path that knows
 * where the reader is. One body is composed per episode and pushed to every follower of that
 * show; they are not in the same place, so a time written on the server would be right for one
 * of them and wrong for the rest.
 *
 * Two rules the format has to respect:
 *
 *   - An inexact airsAt is a *date* that api/_lib/schedule.ts read as midnight UTC, because the
 *     upstream had no time. So it is rendered in UTC and with no clock time. Rendered locally it
 *     would slide: midnight UTC is the previous evening anywhere west of Greenwich, and the
 *     notification would name the wrong day with total confidence.
 *   - An episode already out gets nothing. The title and body have said so; a time is noise.
 *
 * Returns '' for anything it cannot state honestly, including a payload from a server that
 * predates these fields, and the caller then shows the body unchanged.
 */
function airWords(airsAt, exact, now) {
  if (typeof airsAt !== 'number' || !isFinite(airsAt)) return '';
  const date = new Date(airsAt);
  if (isNaN(date.getTime())) return '';
  if (airsAt <= now) return '';

  if (!exact) {
    return date.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  }

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Compared on calendar date rather than on elapsed hours: an episode at 11pm tonight and one at
  // 1am tomorrow are two hours apart and are not the same answer to "what day".
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return time;

  // A weekday name is only unambiguous inside a week of today; past that it needs a date.
  const withinTheWeek = airsAt - now < 6 * 86400000;
  const day = date.toLocaleDateString(
    undefined,
    withinTheWeek ? { weekday: 'short' } : { weekday: 'short', month: 'short', day: 'numeric' },
  );
  return `${day} ${time}`;
}

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const air = airWords(data.airsAt, data.exact, Date.now());
    const options = {
      body: air ? `${data.body} · ${air}` : data.body,
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

/**
 * Focus the app if it is already open, otherwise open it.
 *
 * The comparison is on origin, resolved through `new URL`. `client.url` is absolute
 * (`https://host/`), so the previous `client.url === '/'` could never be true — every tap opened
 * a new window on top of the tab the person already had, which is the one outcome this handler
 * exists to prevent. Origin rather than pathname because the app is a single route: a share link
 * or a redeem URL is the same window, and should be focused rather than duplicated.
 *
 * `includeUncontrolled` because a tab loaded before this worker took control is still the app,
 * and is still the window someone means when they tap.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === target.origin && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target.href) : undefined;
    })
  );
});
