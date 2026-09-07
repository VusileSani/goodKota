const CACHE = "goodkota-v6-1-2-logo-restoration-shell";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/website.css",
  "./website.html",
  "./manifest.webmanifest",
  "./assets/goodkota-logo.png",
  "./assets/goodkota-splash.jpg",
  "./js/app.js",
  "./js/core/store.js",
  "./js/core/utils.js",
  "./js/data/seed.js",
  "./js/infrastructure/local-database.js",
  "./js/repositories/repository-hub.js",
  "./js/services/authorization-service.js",
  "./js/services/command-service.js",
  "./js/services/delivery-service.js",
  "./js/services/feature-flag-service.js",
  "./js/services/financial-ledger-service.js",
  "./js/services/geocoding-service.js",
  "./js/services/geohash-service.js",
  "./js/services/job-service.js",
  "./js/services/location-service.js",
  "./js/services/notification-service.js",
  "./js/services/payment-service.js",
  "./js/services/pricing-service.js",
  "./js/services/quality-service.js",
  "./js/services/retention-service.js",
  "./js/services/search-service.js",
  "./js/services/storefront-service.js",
  "./js/services/telemetry-service.js",
  "./js/public-portal.js",
  "./js/views/customer-view.js",
  "./js/views/merchant-view.js",
  "./js/views/driver-view.js",
  "./js/views/delivery-ops-view.js",
  "./js/views/admin-view.js",
  "./js/views/owner-view.js"
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
