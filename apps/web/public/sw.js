// Cache names are scoped to this app. Never clear another application's caches.
const STATIC_CACHE = "crisismap-static-v7";
const API_CACHE = "crisismap-public-api-v2";
const TILE_CACHE = "crisismap-tiles-v1";
const BACKGROUND_SYNC_TAG = "crisismap-report-sync";
const SAFE_ROUTES = ["/", "/offline", "/report", "/my-reports", "/report/success", "/preparedness", "/resources", "/ai-logs"];
const STATIC_ASSETS = ["/manifest.json", "/favicon.ico", "/icons/icon.svg"];
const offlineClients = new Set();
const assetFlights = new Map();

function documentAssets(html) {
  return [...new Set([...html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g)]
    .map((match) => new URL(match[1].replaceAll("&amp;", "&"), self.location.origin))
    .filter((url) => url.origin === self.location.origin).map((url) => url.href))];
}

async function isOfflineReady(cache) {
  const shell = await cache.match("/offline");
  if (!shell) return false;
  const assets = documentAssets(await shell.text());
  return (await Promise.all(assets.map((asset) => cache.match(asset)))).every(Boolean);
}

async function boundedPut(cache, request, response, limit) {
  if (!response.ok || response.headers.has("set-cookie")) return;
  await cache.put(request, response.clone());
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}

async function timedFetch(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function prepareOffline() {
  const cache = await caches.open(STATIC_CACHE);
  // Fetch each route independently: one unavailable page must not prevent install.
  const routes = await Promise.allSettled(SAFE_ROUTES.map(async (route) => {
    const response = await timedFetch(new Request(new URL(route, self.location.origin), { credentials: "omit", cache: "reload" }));
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return;
    const html = await response.clone().text();
    await Promise.all(documentAssets(html).map(async (assetUrl) => {
      if (await cache.match(assetUrl)) return;
      if (!assetFlights.has(assetUrl)) {
        const flight = (async () => {
          const asset = await timedFetch(new Request(assetUrl, { credentials: "omit" }));
          if (!asset.ok) throw new Error("offline_asset_unavailable");
          await boundedPut(cache, assetUrl, asset, 220);
        })().finally(() => assetFlights.delete(assetUrl));
        assetFlights.set(assetUrl, flight);
      }
      await assetFlights.get(assetUrl);
    }));
    // A route is ready only after its hydration dependencies are persisted.
    await cache.put(route, response);
  }));
  await Promise.allSettled(STATIC_ASSETS.map(async (asset) => {
    const response = await timedFetch(new Request(new URL(asset, self.location.origin)));
    await boundedPut(cache, asset, response, 220);
  }));
  const ready = await isOfflineReady(cache);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "OFFLINE_READY", ready }));
  return routes;
}

self.addEventListener("install", (event) => {
  event.waitUntil(prepareOffline().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("crisismap-") && ![STATIC_CACHE, API_CACHE, TILE_CACHE].includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function cacheFirst(request, name, limit) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.type !== "opaque") await boundedPut(cache, request, response, limit);
  return response;
}

function unavailable() {
  return new Response(JSON.stringify({ success: false, error: "offline_unavailable" }), {
    status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function publicApi(request, offline) {
  const cache = await caches.open(API_CACHE);
  if (!offline) {
    try {
      const response = await timedFetch(request);
      if (response.ok) await boundedPut(cache, request, response, 70);
      if (response.status < 500) return response;
    } catch { /* Fall back to the last confirmed public snapshot. */ }
  }
  const cached = await cache.match(request);
  if (!cached) return unavailable();
  const headers = new Headers(cached.headers);
  headers.set("X-CrisisMap-Cache", "offline");
  return new Response(cached.body, { status: cached.status, headers });
}

async function documentResponse(request, offline) {
  const cache = await caches.open(STATIC_CACHE);
  const path = new URL(request.url).pathname;
  if (!offline) {
    try {
      const response = await timedFetch(request);
      if (response.ok && response.headers.get("content-type")?.includes("text/html")) await boundedPut(cache, path, response, 220);
      if (response.status < 500) return response;
    } catch { /* A cached HTML shell has its own production chunks cached. */ }
  }
  return await cache.match(path) || await cache.match("/offline") || new Response("Open CrisisMap online once to prepare this device for offline use.", { status: 503, headers: { "Content-Type": "text/plain" } });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Writes always reach the real server or reject. Only the page's IndexedDB
  // transaction can acknowledge a locally queued report; never invent HTTP 202.
  if (request.method !== "GET") return;
  const sameOrigin = url.origin === self.location.origin;
  const offline = offlineClients.has(event.clientId);
  // Auth, moderation and dashboard requests keep their existing private network path.
  const privateRequest = request.headers.has("Authorization") || /\/dashboard(?:\/|$)/.test(request.referrer || "");
  if (sameOrigin && privateRequest && url.pathname.startsWith("/api/")) return;
  if (sameOrigin && url.pathname !== "/api/v1/crises/modular-fields" && /^\/api\/v1\/crises(?:\/[^/]+(?:\/footprints)?)?$/.test(url.pathname)) {
    event.respondWith(publicApi(request, offline));
    return;
  }
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 220));
    return;
  }
  // Never return HTML for RSC/Flight requests. A hard navigation uses cached HTML.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
  if (sameOrigin && request.mode === "navigate" && SAFE_ROUTES.includes(url.pathname)) {
    event.respondWith(documentResponse(request, offline));
    return;
  }
  if (sameOrigin && (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith("/icons/"))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 220));
    return;
  }
  // Only tiles already visited can be used offline; this is not a full map pack.
  if (/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname)) {
    event.respondWith(cacheFirst(request, TILE_CACHE, 140));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== BACKGROUND_SYNC_TAG) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: "SYNC_QUEUE" }));
  }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "PREPARE_OFFLINE") event.waitUntil(prepareOffline());
  if (event.data?.type === "CHECK_OFFLINE_READY" && event.source) {
    event.waitUntil(caches.open(STATIC_CACHE).then(async (cache) => {
      event.source.postMessage({ type: "OFFLINE_READY", ready: await isOfflineReady(cache) });
    }));
  }
  if (event.data?.type === "SET_MODE" && event.source?.id) {
    if (event.data.offline) offlineClients.add(event.source.id);
    else offlineClients.delete(event.source.id);
  }
});
