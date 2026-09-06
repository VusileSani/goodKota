const CACHE = "goodkota-v4-shell";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/core/store.js",
  "./js/core/utils.js",
  "./js/data/seed.js",
  "./js/services/location-service.js",
  "./js/services/notification-service.js",
  "./js/services/payment-service.js",
  "./js/services/quality-service.js",
  "./js/services/delivery-service.js",
  "./js/views/customer-view.js",
  "./js/views/merchant-view.js",
  "./js/views/driver-view.js",
  "./js/views/delivery-ops-view.js",
  "./js/views/admin-view.js",
  "./assets/goodkota-logo.png",
  "./assets/goodkota-splash.jpg",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("./"));
});
