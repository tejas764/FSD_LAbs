const CACHE_NAME = 'resqnet-v1.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './dist/css/styles.css',
  './dist/css/leaflet.css',
  './dist/js/leaflet.js',
  './dist/js/db.js',
  './dist/js/seed-data.js',
  './dist/js/sync.js',
  './dist/js/map.js',
  './dist/js/reports.js',
  './dist/js/teams.js',
  './dist/js/resources.js',
  './dist/js/shelters.js',
  './dist/js/dashboard.js',
  './dist/js/app.js',
  './dist/images/icons/icon.svg',
  './dist/images/leaflet/marker-icon.png',
  './dist/images/leaflet/marker-icon-2x.png',
  './dist/images/leaflet/marker-shadow.png'
];

// Install event - Cache core app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ResQNet SW] Pre-caching offline app shell assets');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ResQNet SW] Pre-cache partial warning:', err);
      });
    })
  );
});

// Activate event - Clean up legacy caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ResQNet SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache-first with stale-while-revalidate for local assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If request is for map tiles from external OSM server
  if (url.origin.includes('tile.openstreetmap.org')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Optionally cache successfully loaded tiles in a dynamic tile cache
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open('resqnet-osm-tiles').then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          // If offline, check if tile is in cache
          const cachedTile = await caches.match(event.request);
          if (cachedTile) return cachedTile;
          // Otherwise return 503 or empty tile so client-side tileerror handler fires
          return new Response('', { status: 503, statusText: 'Offline - Map Tile Unavailable' });
        })
    );
    return;
  }

  // For application assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Ignore network errors when offline
        });
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // Fallback to index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// Background sync support
self.addEventListener('sync', (event) => {
  if (event.tag === 'resqnet-sync-reports') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_SYNC' });
        });
      })
    );
  }
});

