// Service Worker for Kemp Carlsbad Booking Widget
// Bump CACHE_NAME on every release that changes /book bundles so users
// don't see stale code due to cache-first /_next/static handling below.
const CACHE_NAME = 'kemp-book-v2';
const OFFLINE_URL = '/book/offline';

const PRECACHE_URLS = [
  '/book',
  '/book-manifest.json',
  '/icons/kemp-icon-192.png',
  '/icons/kemp-icon-512.png',
];

// Install — precache UI assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Non-critical — some assets may not exist yet
        console.log('[SW] Some precache URLs failed, continuing...');
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Ignore non-HTTP(S) schemes (like chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // API calls — network only (never cache)
  if (url.pathname.startsWith('/api/')) return;

  // Next.js App Router RSC payloads — network only (prevents hydration/parsing errors)
  if (request.headers.get('RSC') === '1' || request.url.includes('_rsc=')) return;

  // Static assets (CSS, JS, images) — cache-first
  if (
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|webp|woff2?)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            if (request.url.startsWith('http')) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages — network-first with offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          if (request.url.startsWith('http')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Offline fallback
          return new Response(
            `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline — Kemp Carlsbad</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
      background: #F2F2F7; color: #1a1a2e;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px; text-align: center;
    }
    .offline-card {
      background: #fff; border-radius: 20px; padding: 48px 32px;
      max-width: 400px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .offline-icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #2E6B4F; }
    p { font-size: 15px; color: #666; line-height: 1.5; margin-bottom: 20px; }
    .phone-link {
      display: inline-flex; align-items: center; gap: 8px;
      background: #2E6B4F; color: #fff; padding: 14px 28px;
      border-radius: 12px; text-decoration: none; font-weight: 600;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="offline-card">
    <div class="offline-icon">📡</div>
    <h1>You're offline</h1>
    <p>Please check your internet connection and try again. You can also call us directly:</p>
    <a href="tel:+420723565616" class="phone-link">📞 +420 723 565 616</a>
  </div>
</body>
</html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
  );
});
