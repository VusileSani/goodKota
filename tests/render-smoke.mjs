import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";

const screens = [
  ["customer", "discover", "Good kota."],
  ["customer", "account", "Apply to list your spot"],
  ["merchant", "menu", "Your menu"],
  ["merchant", "orders", "Pickup queue"],
  ["merchant", "support", "Contact GoodKota"],
  ...["overview", "applications", "merchants", "orders", "quality", "support", "reports", "activity"].map(tab => ["admin", tab, tab === "overview" ? "Today at GoodKota" : tab[0].toUpperCase() + tab.slice(1)])
];

for (let index = 0; index < screens.length; index++) {
  const [role, tab, expected] = screens[index];
  const state = {
    ...structuredClone(seed), role, customerTab: role === "customer" ? tab : "discover",
    merchantTab: role === "merchant" ? tab : "orders", adminTab: role === "admin" ? tab : "overview",
    merchantId: "m1", selectedMerchantId: null, search: "", filter: "All", cart: [],
    customerDetails: {firstName:"",lastName:"",phone:"",email:""}, events: []
  };
  const app = {innerHTML:"", insertAdjacentHTML(_position, html) { this.innerHTML += html; }, querySelectorAll() { return []; }, querySelector() { return null; }, addEventListener() {}};
  const passive = {addEventListener() {}};
  const elements = {"#app":app, "#modal":passive, "#toast":{classList:{add(){},remove(){}}}, "#roleSelect":{value:"",addEventListener(){}}, "#locationLabel":{}, "#brandHome":passive};
  globalThis.document = {querySelector(selector) { return elements[selector]; }};
  globalThis.localStorage = {getItem() { return JSON.stringify(state); }, setItem() {}, removeItem() {}};
  await import(`../js/app.js?smoke=${index}`);
  assert(app.innerHTML.includes(expected), `${role}/${tab} did not render ${expected}`);
}
console.log("Customer, merchant and management render smoke passed.");
