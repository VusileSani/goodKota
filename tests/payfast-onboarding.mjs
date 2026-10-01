import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";
import { submitPayfastAccount, reviewPayfastAccount, payfastAccount, PAYFAST_SIGNUP_URL } from "../js/core/payfast-onboarding.js";
import { buildPickupOrder } from "../js/core/checkout.js";

const state = structuredClone(seed);
state.events = [];
state.merchants[0].listingStatus = "active";
const store = {
  state,
  merchant: id => state.merchants.find(item => item.id === id),
  log(type, payload) { state.events.push({type, payload}); }
};

assert.equal(payfastAccount(store.merchant("m1")).status, "not_started");
assert(PAYFAST_SIGNUP_URL.startsWith("https://payfast.io/"));
assert.throws(() => submitPayfastAccount(store, "m1", {accountType:"business", merchantId:"123"}), /eight-digit/);
assert.throws(() => submitPayfastAccount(store, "m1", {accountType:"", merchantId:"12345678"}), /account type/);

let account = submitPayfastAccount(store, "m1", {accountType:"individual", merchantId:"12345678"});
assert.equal(account.status, "submitted");
assert.equal(account.accountType, "individual");
assert.throws(() => submitPayfastAccount(store, "m2", {accountType:"business", merchantId:"12345678"}), /already used/);
assert.throws(() => reviewPayfastAccount(store, "m2", "details_checked", "Checked"), /No PayFast account/);
assert.throws(() => reviewPayfastAccount(store, "m1", "details_checked", ""), /review note/);

reviewPayfastAccount(store, "m1", "needs_action", "Please confirm your account type.");
assert.equal(account.status, "needs_action");
account = submitPayfastAccount(store, "m1", {accountType:"business", merchantId:"12345678"});
assert.equal(account.status, "submitted");
assert.equal(account.reviewNote, "");
reviewPayfastAccount(store, "m1", "details_checked", "Details matched the merchant's submission.");
assert.equal(account.status, "details_checked");
assert.equal(submitPayfastAccount(store, "m1", {accountType:"business", merchantId:"12345678"}), account);

const order = buildPickupOrder({firstName:"Nandi",phone:"0111111111",email:"nandi@example.test"}, store.merchant("m1"), [
  {productId:"p1", name:"Classic Kota", unitPrice:4800, qty:1, choices:[]}
]);
assert.equal(order.paymentStatus, "unpaid", "Account review must not enable online payment");
assert.equal(order.paymentMethod, "pay_on_collection");
assert(state.events.some(event => event.type === "payfast_account_reviewed"));
console.log("Merchant PayFast onboarding workflow passed.");
