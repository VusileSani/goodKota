import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";
import { canOrder, submitApplication, reviewApplication, reviewMerchant, setMerchantStatus, setQuality, transitionOrder, createCase, updateCase, orderReport } from "../js/core/operations.js";
import { buildPickupOrder } from "../js/core/checkout.js";

const state = structuredClone(seed);
state.events = [];
const store = {
  state,
  merchant: id => state.merchants.find(m => m.id === id),
  log(type, payload) { state.events.push({type, payload}); }
};
const application = submitApplication(store, {
  businessName: "Test Kota", contactName: "Operator", phone: "0100000000", email: "test@example.test",
  area: "Midrand", address: "10 Test Street, Midrand", note: "Local pickup"
});
assert.equal(application.status, "new");
reviewApplication(store, application.id, "approved", application, "Checked intake details");
const merchant = store.merchant(application.merchantId);
assert(merchant);
assert.equal(merchant.listingStatus, "review");
assert.equal(canOrder(merchant), false);
assert.throws(() => setMerchantStatus(store, merchant.id, "active", "Ready"), /quality checks/);

merchant.menu.push({id: "test-product", name: "Kota", price: 5000, available: true});
reviewMerchant(store, merchant.id, {local:true,kota:true,consistency:true,value:true,readiness:true}, "All five checks documented");
setMerchantStatus(store, merchant.id, "active", "Ready for listing");
merchant.online = true;
assert.equal(canOrder(merchant), true);
setQuality(store, merchant.id, "intervention", "Quality concern");
assert.equal(canOrder(merchant), false);
assert.equal(merchant.listingStatus, "paused");
assert.throws(() => setMerchantStatus(store, merchant.id, "active", "Try again"), /intervention/);
setQuality(store, merchant.id, "healthy", "Follow-up passed");
setMerchantStatus(store, merchant.id, "active", "Follow-up complete");

const checkout = buildPickupOrder({firstName:"Nandi",lastName:"Dube",phone:"0111111111",email:"nandi@example.test"}, merchant, [
  {productId:"test-product", name:"Kota", unitPrice:6200, qty:2, choices:[{id:"extra",name:"Cheese",kind:"add",price:1200}]}
]);
assert.equal(checkout.total, 12400);
assert.equal(checkout.paymentStatus, "unpaid");
assert.equal(checkout.fulfillment, "pickup");
assert.equal(checkout.pickup.address, "10 Test Street, Midrand");
assert.equal(checkout.customerDetails.firstName, "Nandi");

const order = {id:"GK-TEST", merchantId:merchant.id, status:"new", total:6200, createdIso:"2026-09-25T12:00:00.000Z"};
state.orders.push(order);
transitionOrder(store, order.id, "accepted");
assert.throws(() => transitionOrder(store, order.id, "completed"), /cannot move/);
transitionOrder(store, order.id, "ready");
transitionOrder(store, order.id, "completed");
assert.equal(order.status, "completed");

const cancelled = {id:"GK-CANCEL", merchantId:merchant.id, status:"new", total:3000, createdIso:"2026-09-25T12:00:00.000Z"};
state.orders.push(cancelled);
assert.throws(() => transitionOrder(store, cancelled.id, "cancelled"), /reason/);
transitionOrder(store, cancelled.id, "cancelled", "Out of stock");
const report = orderReport(state, {from:"2026-09-01", to:"2026-09-30", merchantId:merchant.id});
assert.deepEqual([report.count, report.cancelled, report.orderValue], [1,1,6200]);

const supportCase = createCase(store, merchant.id, "Menu help", "Need to edit options");
updateCase(store, supportCase.id, "resolved", "Walked through the menu editor");
assert.equal(supportCase.status, "resolved");
assert(state.events.some(event => event.type === "support_case_updated"));
console.log("Operations workflow passed.");
