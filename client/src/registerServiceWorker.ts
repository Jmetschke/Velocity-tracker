// PWA registration: installs the online-first service worker after the app has loaded.
// Keeping this small avoids interfering with tRPC/API calls that carry live database data.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(error => {
      console.warn("[PWA] Service worker registration failed:", error);
    });
  });
}
