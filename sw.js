/**
 * FIFO PRO — sw.js
 * Service Worker: offline caching + background sync
 */

// Bumped v1 -> v2: STATIC_ASSETS changed (learningEngine.js added,
// decisionEngine.js rewritten) — old caches are evicted in 'activate'.
// Bumped v3 -> v4: app.js/index.html changed significantly this session
// (auth removal, Polygon->Finnhub, Mission Control, lazy tab rendering)
// without ever bumping the cache version — returning users were stuck
// on a cache-first-served stale bundle indefinitely. Bump this version
// any time index.html or any js/*.js file changes, or clients will keep
// serving old code forever regardless of what's deployed.
const CACHE_NAME   = 'fifopro-v4';
const STATIC_CACHE = 'fifopro-static-v4';

// NOTE: paths are relative (no leading "/") so they resolve correctly
// both at a domain root AND under a GitHub Pages project subpath
// (e.g. https://user.github.io/repo-name/). A leading "/" would always
// resolve to the domain root and 404 on project pages.
const STATIC_ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'css/mobile.css',
  'js/utils.js',
  'js/learningEngine.js',
  'js/api.js',
  'js/app.js',
  'js/charts.js',
  'js/dashboard.js',
  'js/positions.js',
  'js/watchlist.js',
  'js/journal.js',
  'js/analytics.js',
  'js/decisionEngine.js',
  'js/aiCoach.js',
  'js/aiChat.js',
  'js/trades.js',
  'js/quicktrade.js',
  'js/auth.js',
  'js/dailyGrade.js',
  'js/tradeReplay.js',
  'js/performanceTimeline.js',
  'js/settings.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err.message);
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: Google Apps Script (always live — trades/positions/watchlist/
  // prices/indicators/AI Chat all proxy through it, never call third
  // -party APIs directly from the browser)
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return res;
      }).catch(() => {
        // Offline fallback for navigation
        if (request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
