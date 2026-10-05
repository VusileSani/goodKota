import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";
import { canOrder, submitApplication, reviewApplication, reviewMerchant, setMerchantStatus, setQuality, transitionOrder, requestRefundReview, reviewRefundRequest, createCase, updateCase, orderReport } from "../js/core/operations.js";
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

merchant.menu.push({id: "test-product", name: "Kota", price: 5000, available: true,
  choices:[{id:"extra",name:"Cheese",kind:"add",price:1200,available:true}]});
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
merchant.online = true;

const checkout = buildPickupOrder({firstName:"Nandi",lastName:"Dube",phone:"0111111111",email:"nandi@example.test"}, merchant, [
  {productId:"test-product", name:"Kota", unitPrice:6200, qty:2, choices:[{id:"extra",name:"Cheese",kind:"add",price:1200}]}
]);
assert.equal(checkout.total, 12400);
assert.match(checkout.id, /^GK-[0-9A-F]{16}$/);
assert.throws(() => buildPickupOrder(checkout.customerDetails, merchant, [{productId:"test-product",name:"Kota",unitPrice:1,qty:1,choices:[]}]), /Menu changed/);
assert.throws(() => buildPickupOrder(checkout.customerDetails, merchant, [{productId:seed.merchants[0].menu[0].id,unitPrice:4800,qty:1,choices:[]}]), /Menu changed/);
assert.throws(() => buildPickupOrder(checkout.customerDetails, merchant, [{productId:"test-product",name:"Kota",unitPrice:5000,qty:Number.MAX_SAFE_INTEGER,choices:[]}]), /Review your cart/);
merchant.menu.push({id:"cent-product",name:"Small Kota",price:4850,available:true});
const centOrder = buildPickupOrder(checkout.customerDetails, merchant, [{productId:"cent-product",name:"Small Kota",unitPrice:4850,qty:1,choices:[]}]);
assert.equal(centOrder.total, 4850, "Cents must survive order creation");
merchant.online = false;
assert.throws(() => buildPickupOrder(checkout.customerDetails, merchant, [{productId:"cent-product",name:"Small Kota",unitPrice:4850,qty:1,choices:[]}]), /not taking orders/);
merchant.online = true;
assert.equal(checkout.paymentStatus, "unpaid");
assert.equal(checkout.fulfillment, "pickup");
assert.equal(checkout.pickup.address, "10 Test Street, Midrand");
assert.equal(checkout.customerDetails.firstName, "Nandi");
const sample = seed.merchants[0].menu[0];
assert.equal(selectedChoices(sample, ["p1-cheese", "p1-hot"]).length, 2);
assert.throws(() => selectedChoices(sample, ["p1-hot", "p1-mild"]), /one per preference/);
assert.equal(sameChoice({id:"p1-hot",name:"Hot",kind:"select",group:"Heat",price:0}, sample.choices.find(c => c.id === "p1-hot")), true);

const order = {id:"GK-TEST", merchantId:merchant.id, status:"new", paymentStatus:"unpaid", total:6200, createdIso:"2026-09-25T12:00:00.000Z"};
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
assert.throws(() => requestRefundReview(store, "m1", order.id, {reason:"Issue",paymentMethod:"cash"}), /this spot/);
assert.throws(() => requestRefundReview(store, merchant.id, order.id, {reason:"",paymentMethod:"cash"}), /Refund reason/);
assert.throws(() => requestRefundReview(store, merchant.id, order.id, {reason:"Issue",paymentMethod:"unknown"}), /how the customer paid/);
const request = requestRefundReview(store, merchant.id, order.id, {reason:"Kota was missing an item",paymentMethod:"card",paymentReference:"POS-123"});
assert.deepEqual([request.status, request.amount, order.paymentStatus], ["requested",6200,"unpaid"]);
assert.throws(() => requestRefundReview(store, merchant.id, order.id, {reason:"Again",paymentMethod:"cash"}), /already has/);
assert.throws(() => reviewRefundRequest(store, order.id, "resolved", "Sent to card", "handled_externally"), /reference/);
reviewRefundRequest(store, order.id, "needs_info", "Please include receipt details");
assert.equal(request.adminNote, "Please include receipt details");
requestRefundReview(store, merchant.id, order.id, {reason:"Kota was missing an item",paymentMethod:"card",paymentReference:"POS-124"});
assert.equal(request.status, "needs_info", "Earlier review object stays as an audit snapshot");
assert.equal(order.refundReview.status, "requested");
assert.deepEqual(order.refundReview.history.map(entry => entry.action), ["requested", "needs_info", "resubmitted"]);
reviewRefundRequest(store, order.id, "resolved", "Customer refunded at till", "handled_externally", "VOID-124");
assert.equal(order.refundReview.externalReference, "VOID-124");
assert.equal(order.refundReview.history.at(-1).action, "resolved");
assert.equal(order.status, "completed");
assert.throws(() => reviewRefundRequest(store, order.id, "resolved", "Again", "not_due"), /not awaiting review/);
assert(state.events.some(event => event.type === "refund_review_updated" && event.payload.outcome === "handled_externally"));
const report = orderReport(state, {from:"2026-09-01", to:"2026-09-30", merchantId:merchant.id});
assert.deepEqual([report.count, report.cancelled, report.orderValue], [3,1,14200]);

const supportCase = createCase(store, merchant.id, "Menu help", "Need to edit options");
updateCase(store, supportCase.id, "resolved", "Walked through the menu editor");
assert.equal(supportCase.status, "resolved");
assert(state.events.some(event => event.type === "support_case_updated"));
console.log("Operations workflow passed.");
