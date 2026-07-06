const APP_VERSION = "0.0.1";
const CACHE_PREFIX = "loopcat-offline-";
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./icons/loopcat-icon.svg",
  "./storage.js",
  "./workspace-storage.js",
  "./docx.js",
  "./tm.js",
  "./termbase.js",
  "./tmx.js",
  "./tbx.js",
  "./encoding.js",
  "./xliff.js",
  "./localization.js",
  "./qa.js",
  "./validation.js",
  "./analysis.js",
  "./ai.js",
  "./worker-client.js",
  "./cat-worker.js",
  "./project.js",
  "./app.js"
];

const CORE_ASSET_URLS = new Set(CORE_ASSETS.map((asset) => new URL(asset, self.location.href).href));
const INDEX_URL = new URL("./index.html", self.location.href).href;

async function cacheCoreAssets(cache) {
  const failedAssets = [];
  await Promise.all(CORE_ASSETS.map(async (asset) => {
    try {
      await cache.add(asset);
    } catch (error) {
      failedAssets.push(`${asset}: ${error?.message || error}`);
      console.warn("Offline shell asset cache failed.", asset, error);
    }
  }));
  if (failedAssets.length) {
    throw new Error(`Offline shell core asset cache failed: ${failedAssets.join("; ")}`);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cacheCoreAssets(cache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function shouldHandle(request) {
  const url = new URL(request.url);
  return request.method === "GET" && url.origin === self.location.origin;
}

function normalizedRequestUrl(request) {
  const url = new URL(request.url);
  url.hash = "";
  return url.href;
}

function isCoreAssetRequest(request) {
  return CORE_ASSET_URLS.has(normalizedRequestUrl(request));
}

function isNavigationRequest(request) {
  const accept = request.headers.get("accept") || "";
  return request.mode === "navigate" || accept.includes("text/html");
}

async function cachedIndex() {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(INDEX_URL);
}

self.addEventListener("fetch", (event) => {
  if (!shouldHandle(event.request)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const navigation = isNavigationRequest(event.request);
      try {
        const response = await fetch(event.request);
        if (!response || response.status !== 200 || response.type === "opaque") {
          if (navigation) return (await cachedIndex()) || response;
          return response;
        }
        if (isCoreAssetRequest(event.request)) {
          const copy = response.clone();
          event.waitUntil(
            cache.put(event.request, copy)
              .catch((error) => {
                console.warn("Offline shell runtime cache write failed.", event.request.url, error);
              })
          );
        }
        return response;
      } catch (error) {
        if (navigation) {
          const fallback = await cachedIndex();
          if (fallback) return fallback;
        }
        throw error;
      }
    })()
  );
});
