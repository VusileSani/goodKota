import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";
import { canOrder, submitApplication, reviewApplication, reviewMerchant, setMerchantStatus, setQuality, transitionOrder, createCase, updateCase, orderReport } from "../js/core/operations.js";
import { buildPickupOrder } from "../js/core/checkout.js";
import { merchantExperience, rateCompletedOrder } from "../js/core/feedback.js";
import { selectedChoices, sameChoice } from "../js/core/menu-choices.js";

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
const sample = seed.merchants[0].menu[0];
assert.equal(selectedChoices(sample, ["p1-cheese", "p1-hot"]).length, 2);
assert.throws(() => selectedChoices(sample, ["p1-hot", "p1-mild"]), /one per preference/);
assert.equal(sameChoice({id:"p1-hot",name:"Hot",kind:"select",group:"Heat",price:0}, sample.choices.find(c => c.id === "p1-hot")), true);

const order = {id:"GK-TEST", merchantId:merchant.id, status:"new", total:6200, createdIso:"2026-09-25T12:00:00.000Z"};
state.orders.push(order);
transitionOrder(store, order.id, "accepted");
assert.throws(() => transitionOrder(store, order.id, "completed"), /cannot move/);
transitionOrder(store, order.id, "ready");
transitionOrder(store, order.id, "completed");
assert.equal(order.status, "completed");
assert.equal(merchantExperience(state, merchant.id).tone, "neutral");
rateCompletedOrder(store, order.id, "amazing");
assert.throws(() => rateCompletedOrder(store, order.id, "good"), /already been rated/);
for (const [id, rating] of [["GK-2","good"],["GK-3","average"]]) {
  const completed = {id, merchantId:merchant.id, status:"completed", total:4000, createdIso:"2026-09-25T12:00:00.000Z"};
  state.orders.push(completed);
  rateCompletedOrder(store, id, rating);
}
assert.deepEqual(merchantExperience(state, merchant.id).counts, {amazing:1, good:1, average:1});
assert.equal(merchantExperience(state, merchant.id).tone, "amber");
const feedbackState = values => ({orders:values.map((value, index) => ({id:`R${index}`, merchantId:"ratings", status:"completed", experience:{value, at:`2026-09-25T12:00:0${index}Z`}}))});
assert.equal(merchantExperience(feedbackState(["amazing","amazing","amazing"]), "ratings").tone, "green");
assert.equal(merchantExperience(feedbackState(["average","average","average"]), "ratings").tone, "red");

const cancelled = {id:"GK-CANCEL", merchantId:merchant.id, status:"new", total:3000, createdIso:"2026-09-25T12:00:00.000Z"};
state.orders.push(cancelled);
assert.throws(() => transitionOrder(store, cancelled.id, "cancelled"), /reason/);
transitionOrder(store, cancelled.id, "cancelled", "Out of stock");
const report = orderReport(state, {from:"2026-09-01", to:"2026-09-30", merchantId:merchant.id});
assert.deepEqual([report.count, report.cancelled, report.orderValue], [3,1,14200]);

const supportCase = createCase(store, merchant.id, "Menu help", "Need to edit options");
updateCase(store, supportCase.id, "resolved", "Walked through the menu editor");
assert.equal(supportCase.status, "resolved");
assert(state.events.some(event => event.type === "support_case_updated"));
console.log("Operations workflow passed.");
