const CACHE = "goodkota-mvp-v12";
const ASSETS = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./js/core/store.js", "./js/core/checkout.js", "./js/core/operations.js", "./js/core/feedback.js", "./js/core/menu-choices.js", "./js/views/admin-view.js", "./js/views/payfast-setup.js", "./js/data/seed.js", "./assets/goodkota-logo.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (new URL(event.request.url).pathname.includes("/api/")) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
