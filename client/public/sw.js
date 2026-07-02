/* Obliplan service worker — hand-written app-shell cache.
 *
 * CACHE INVALIDATION: bump CACHE_VERSION by hand whenever this file, the shell,
 * or an unhashed public asset (manifest/icons) changes; `activate` then evicts
 * every cache whose key !== CACHE_VERSION. Vite's /assets/ output is content-
 * hashed (immutable), so those never need a bump, and navigations are network-
 * first, so an online user always gets a fresh index.html regardless.
 *
 * CACHING POLICY — ALLOW-KNOWN-IMMUTABLE, not deny-by-prefix:
 *   - navigations → network-first with an offline fallback to the cached shell;
 *   - /assets/* (Vite's hashed, immutable bundles) + the explicit shell entries
 *     → cache-first;
 *   - EVERYTHING ELSE (/api, /auth, any dynamic or unknown route) → straight to
 *     the network, never cached (no auth/staleness hazard).
 *
 * We deliberately do NOT call skipWaiting()/clients.claim(): a new SW waits until
 * all old tabs close before activating, so an already-open tab keeps its old
 * cache (and its old hashed chunks stay resolvable) for its whole lifetime — no
 * post-deploy "stale chunk 404" brick. (main.tsx also reloads on vite:preloadError
 * as a belt-and-braces guard.)
 */
const CACHE_VERSION = 'obliplan-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))),
  );
});

/** Only Vite's content-hashed bundles and the explicit shell are safe to cache. */
function isCacheable(pathname) {
  return pathname.startsWith('/assets/') || APP_SHELL.includes(pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever touch same-origin GET; the browser handles the rest (non-GET,
  // cross-origin, and all dynamic/auth calls — which must never be cached).
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network-first, fall back to the cached offline shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match('/index.html')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Immutable assets only: cache-first. Anything else falls through to network.
  if (!isCacheable(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      // Cache only a genuine same-origin 200 (never opaque/cross-origin/partial).
      if (response.status === 200 && response.type === 'basic' && !request.headers.has('range')) {
        try {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        } catch {
          /* best-effort — a put failure must never break the response */
        }
      }
      return response;
    })(),
  );
});

// ── Web Push ──────────────────────────────────────────────────────────────────
// The server sends a JSON payload { title, body?, url? }. Show a notification and,
// on click, focus an existing app tab (navigating it) or open a new one.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || 'Obliplan';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            await client.focus();
            if ('navigate' in client && target) await client.navigate(target);
          } catch {
            /* ignore focus/navigate failures */
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
