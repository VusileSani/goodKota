import assert from "node:assert/strict";
import { calculatePricing } from "../js/domain/pricing.js";
import { nextOrderStatus, orderProgress, transitionOrder } from "../js/domain/orderLifecycle.js";

const pricing = calculatePricing({
  items: [
    { unitPrice: 45, quantity: 2 },
    { unitPrice: 18, quantity: 1 }
  ],
  deliveryFee: 25,
  promo: { code: "KOTA10", status: "ACTIVE", minimumSpend: 50, discountPercent: 10 },
  tipPercent: 10
});

assert.equal(pricing.subtotal, 108);
assert.equal(pricing.discount, 10.8);
assert.equal(pricing.tip, 9.72);
assert.equal(pricing.total, 131.92);
assert.equal(pricing.promoCode, "KOTA10");

let order = {
  fulfilmentType: "DELIVERY",
  status: "PENDING",
  statusHistory: [{ status: "PENDING", at: "2026-09-05T20:00:00Z" }]
};
assert.equal(nextOrderStatus(order), "ACCEPTED");
order = transitionOrder(order, "ACCEPTED", "2026-09-05T20:01:00Z");
assert.equal(order.status, "ACCEPTED");
assert.equal(order.statusHistory.length, 2);
order = transitionOrder(order, "PREPARING", "2026-09-05T20:02:00Z");
assert.equal(nextOrderStatus(order), "READY");
assert.equal(orderProgress(order).find(step => step.status === "PREPARING").current, true);

let invalidRaised = false;
try {
  transitionOrder(order, "COMPLETED");
} catch {
  invalidRaised = true;
}
assert.equal(invalidRaised, true);

console.log("GoodKota V1.0 domain tests passed.");
