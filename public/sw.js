/// <reference lib="webworker" />

const CACHE_NAME = "lang-tracker-v1";

// Files to precache (will be populated on first load)
const PRECACHE_URLS = ["/", "/index.html"];

/** @type {ServiceWorkerGlobalScope} */
const sw = /** @type {any} */ (globalThis);

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  sw.clients.claim();
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and AnkiConnect requests
  if (
    request.method !== "GET" ||
    url.origin !== sw.location.origin ||
    (url.hostname === "localhost" && url.port === "8765")
  ) {
    return;
  }

  // Skip Firebase/Google API calls
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firestore.googleapis.com")
  ) {
    return;
  }

  // Network-first for navigation, cache-first for assets
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then((r) => r ?? new Response("Offline", { status: 503 })),
        ),
    );
  } else {
    // Assets: cache-first
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
  }
});
