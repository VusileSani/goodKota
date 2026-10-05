import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";

const screens = [
  ["customer", "discover", "Good kota."],
  ["customer", "account", "Apply to list your spot"],
  ["merchant", "menu", "Your menu"],
  ["merchant", "store", "Your PayFast account"],
  ["merchant", "orders", "Pickup queue"],
  ["merchant", "support", "Contact GoodKota"],
  ...["overview", "applications", "merchants", "orders", "quality", "support", "reports", "payments", "activity"].map(tab => ["admin", tab, tab === "overview" ? "Today at GoodKota" : tab[0].toUpperCase() + tab.slice(1)])
];

for (let index = 0; index < screens.length; index++) {
  const [role, tab, expected] = screens[index];
  const state = {
    ...structuredClone(seed), role, customerTab: role === "customer" ? tab : "discover",
    merchantTab: role === "merchant" ? tab : "orders", adminTab: role === "admin" ? tab : "overview",
    merchantId: "m1", selectedMerchantId: null, search: "", filter: "All", cart: [],
    customerDetails: {firstName:"",lastName:"",phone:"",email:""}, events: []
  };
  if (role === "merchant" && tab === "menu") state.merchants[0].menu[0].price = 4850;
  const app = {innerHTML:"", insertAdjacentHTML(_position, html) { this.innerHTML += html; }, querySelectorAll() { return []; }, querySelector() { return null; }, addEventListener() {}};
  const passive = {addEventListener() {}};
  const elements = {"#app":app, "#modal":passive, "#toast":{classList:{add(){},remove(){}}}, "#roleSelect":{value:"",addEventListener(){}}, "#locationLabel":{}, "#locationButton":passive, "#brandHome":passive};
  globalThis.document = {querySelector(selector) { return elements[selector]; }};
  globalThis.localStorage = {getItem() { return JSON.stringify(state); }, setItem() {}, removeItem() {}};
  await import(`../js/app.js?smoke=${index}`);
  assert(app.innerHTML.includes(expected), `${role}/${tab} did not render ${expected}`);
  if (role === "merchant" && tab === "menu") assert(app.innerHTML.includes("48,50"), "Rand and cents must be shown exactly");
  if (role === "merchant" && tab === "store") {
    assert(app.innerHTML.includes("payfastAccountForm"));
    assert(app.innerHTML.includes("https://payfast.io/gateway-aggregator-selector/"));
    assert(app.innerHTML.includes("Open Maps"));
  }
}
const merchantState = {
  ...structuredClone(seed), role:"merchant", merchantTab:"orders", merchantId:"m1", events:[],
  orders:[{id:"GK-READY", merchantId:"m1", status:"ready", customer:"Test customer", items:[], total:4800, createdAt:"Today"},
    {id:"GK-PREVIOUS", merchantId:"m1", status:"completed", customer:"Nandi Dube", contact:{phone:"0111111111"}, items:[{productId:"p1",name:"Classic Kota",qty:1,unitPrice:4800}], total:4800, createdAt:"Yesterday"}]
};
const historyButton = {dataset:{orderHistory:"GK-PREVIOUS"},addEventListener(_type, handler) { this.click = handler; }};
const refundButton = {addEventListener(_type, handler) { this.click = handler; }};
const merchantApp = {innerHTML:"", querySelectorAll(selector) { return selector === "[data-order-history]" ? [historyButton] : []; }, querySelector() { return null; }, addEventListener() {}};
const passive = {addEventListener() {}};
const historyModal = {innerHTML:"",open:false,showModal() { this.open = true; },close() { this.open = false; },addEventListener() {},querySelector(selector) { return selector === "#requestRefundReview" ? refundButton : passive; }};
const elements = {"#app":merchantApp, "#modal":historyModal, "#toast":{classList:{add(){},remove(){}}}, "#roleSelect":{value:"",addEventListener(){}}, "#locationLabel":{}, "#locationButton":passive, "#brandHome":passive};
globalThis.document = {querySelector(selector) { return elements[selector]; }};
globalThis.localStorage = {getItem() { return JSON.stringify(merchantState); }, setItem() {}, removeItem() {}};
await import("../js/app.js?smoke=priority-queue");
assert(merchantApp.innerHTML.indexOf("Ready · 1") < merchantApp.innerHTML.indexOf("New · 0"), "Occupied queue should be first");
assert(merchantApp.innerHTML.indexOf("Pickup queue") < merchantApp.innerHTML.indexOf("merchant-metrics"), "Orders should be reachable before metrics");
assert(merchantApp.innerHTML.includes('data-order-history="GK-PREVIOUS"'), "Previous orders must be actionable");
assert(merchantApp.innerHTML.includes('href="#merchantOrderHistory"'), "Past orders should be reachable from the queue heading");
historyButton.click();
assert(historyModal.innerHTML.includes("Nandi Dube") && historyModal.innerHTML.includes("Classic Kota"), "Previous order should show customer and item detail");
refundButton.click();
assert(historyModal.innerHTML.includes("Send for review") && historyModal.innerHTML.includes("this form does not issue a refund"), "Merchant refund action should request review, not claim a payout");

for (const detail of [false, true]) {
  const state = {
    ...structuredClone(seed), role:"customer", customerTab:"discover", selectedMerchantId:detail ? "m1" : null,
    search:"", filter:"All", merchantId:"m1", events:[], cart:[{productId:"p1", qty:2, name:"Classic Kota", unitPrice:4800, choices:[]}],
    customerDetails:{firstName:"",lastName:"",phone:"",email:""}
  };
  const cartButton = {addEventListener(type, handler) { if (type === "click") this.click = handler; }};
  const increase = {dataset:{line:"0",qty:"1"}, addEventListener(type, handler) { if (type === "click") this.click = handler; }};
  const cartApp = {
    innerHTML:"", insertAdjacentHTML(_position, html) { this.innerHTML += html; },
    querySelectorAll(selector) { return selector === "[data-cart]" ? [cartButton] : []; },
    querySelector() { return null; }, addEventListener() {}
  };
  const cartModal = {
    innerHTML:"", showModal() {}, close() {}, addEventListener() {},
    querySelector() { return passive; },
    querySelectorAll(selector) { return selector === "[data-qty]" ? [increase] : []; }
  };
  const cartElements = {"#app":cartApp, "#modal":cartModal, "#toast":{classList:{add(){},remove(){}}}, "#roleSelect":{value:"",addEventListener(){}}, "#locationLabel":{}, "#locationButton":passive, "#brandHome":passive};
  globalThis.document = {querySelector(selector) { return cartElements[selector]; }};
  globalThis.localStorage = {getItem() { return JSON.stringify(state); }, setItem() {}, removeItem() {}};
  await import(`../js/app.js?smoke=bottom-cart-${detail}`);
  assert.equal((cartApp.innerHTML.match(/data-cart/g) || []).length, 1, "Customer should have one cart action");
  assert(cartApp.innerHTML.includes("View cart, 2 items, R 96") || cartApp.innerHTML.includes("View cart, 2 items, R96"), "Bottom cart should show item count and total");
  if (detail) {
    assert(cartApp.innerHTML.includes('class="cart-dock detail"'), "Merchant menu should show bottom cart");
    assert(!cartApp.innerHTML.includes('class="bottom-nav"'), "Merchant menu does not display tab navigation");
  } else {
    assert(cartApp.innerHTML.indexOf('class="cart-dock ') < cartApp.innerHTML.indexOf('class="bottom-nav"'), "Cart action should precede bottom navigation");
  }
  cartButton.click();
  assert(cartModal.innerHTML.includes("Place pickup order"), "Bottom cart should open existing checkout");
  increase.click();
  assert(cartApp.innerHTML.includes("View cart, 3 items"), "Dock count should update after cart quantity changes");
}
console.log("Customer, merchant and management render smoke passed.");
