export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    throw new Error("Notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  return permission;
}

export async function showLocalNotification(title, options = {}) {
  const registration = await navigator.serviceWorker?.ready;
  if (registration?.showNotification) {
    return registration.showNotification(title, {
      icon: "./assets/icon.svg",
      badge: "./assets/icon.svg",
      ...options
    });
  }

  if (Notification.permission === "granted") {
    return new Notification(title, options);
  }
}
