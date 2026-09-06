export const DELIVERY_STATUS_ORDER = [
  "awaiting_prep",
  "ready_for_dispatch",
  "assigned",
  "driver_to_pickup",
  "at_pickup",
  "picked_up",
  "en_route",
  "arriving",
  "delivered"
];

export function deliveryStatusLabel(status) {
  const labels = {
    awaiting_prep: "Merchant preparing",
    ready_for_dispatch: "Ready for driver",
    assigned: "Driver assigned",
    driver_to_pickup: "Driver heading to merchant",
    at_pickup: "Driver at merchant",
    picked_up: "Order collected",
    en_route: "On the way",
    arriving: "Arriving",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  return labels[status] || String(status || "").replaceAll("_", " ");
}

export function deliveryProgress(status) {
  if (status === "cancelled") return 0;
  const index = DELIVERY_STATUS_ORDER.indexOf(status);
  if (index < 0) return 0;
  return Math.round((index / (DELIVERY_STATUS_ORDER.length - 1)) * 100);
}

export function isActiveDelivery(task) {
  return Boolean(task) && !["delivered", "cancelled"].includes(task.status);
}

export function estimateMinutes(distance, assumedKmh = 28) {
  if (!Number.isFinite(distance)) return null;
  return Math.max(2, Math.round((distance / assumedKmh) * 60));
}

export function nextDriverStatus(status) {
  const next = {
    assigned: "driver_to_pickup",
    driver_to_pickup: "at_pickup",
    at_pickup: "picked_up",
    picked_up: "en_route",
    en_route: "arriving"
  };
  return next[status] || null;
}

export function statusEvent(status, driverName = "Driver") {
  const events = {
    driver_to_pickup: { type: "driver_to_pickup", message: `${driverName} is heading to the merchant` },
    at_pickup: { type: "driver_at_pickup", message: `${driverName} arrived at the merchant` },
    picked_up: { type: "pickup_confirmed", message: "Order collected from merchant" },
    en_route: { type: "en_route", message: "Driver is on the way" },
    arriving: { type: "arriving", message: "Driver is approaching the delivery point" },
    delivered: { type: "delivered", message: "Delivery completed" }
  };
  return events[status] || { type: status, message: deliveryStatusLabel(status) };
}
