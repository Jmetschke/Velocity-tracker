// PWA service worker for installability and a lightweight app-shell fallback.
// It is intentionally online-first and does not cache /api/* or mutation traffic,
// so Render backend calls and Turso-connected routes continue to use live data.
const CACHE_NAME = "elevated-production-scheduler-v3";
const APP_SHELL_URLS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && isStaticAssetRequest(request)) {
          const responseForCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseForCache));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Only document navigation may fall back to the app shell. Returning
        // index.html for a missing script makes the browser parse HTML as JS.
        if (request.mode === "navigate") {
          return (await caches.match("/")) ?? Response.error();
        }

        return Response.error();
      })
  );
});

function isStaticAssetRequest(request) {
  return ["document", "script", "style", "image", "font", "manifest"].includes(request.destination);
}
