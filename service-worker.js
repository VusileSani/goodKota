const CACHE = "goodkota-mvp-v8";
const ASSETS = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./js/core/store.js", "./js/data/seed.js", "./assets/goodkota-logo.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
