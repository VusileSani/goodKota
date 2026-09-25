import assert from "node:assert/strict";
import { seed } from "../js/data/seed.js";
import { renderAdminWorkspace } from "../js/views/admin-view.js";

const state = structuredClone(seed);
state.adminTab = "merchants";
state.events = [];
state.merchants.forEach(merchant => { merchant.listingStatus = "active"; });
state.merchants[3].listingStatus = "review";
const store = {
  state,
  merchant: id => state.merchants.find(m => m.id === id),
  save() {},
  log(type, payload) { state.events.push({ type, payload }); }
};
const listener = dataset => ({dataset, addEventListener(_type, callback) { this.click = callback; }});
const controls = {
  manage: listener({manageMerchant:"m1"}),
  quality: listener({}),
  address: {value:state.merchants[0].address, addEventListener(_type, callback) { this.input = callback; }},
  area: {value:state.merchants[0].area, addEventListener(_type, callback) { this.input = callback; }},
  maps: {href:""},
  reason: {value:"Closing for refurbishment", reportValidity() { return Boolean(this.value.trim()); }},
  active: listener({listingStatus:"active"}),
  paused: listener({listingStatus:"paused"}),
  review: listener({listingStatus:"review"})
};
const form = {
  addEventListener() {},
  querySelector(selector) { return selector.includes("address") ? controls.address : controls.area; }
};
const modal = {
  innerHTML:"", showModal() {}, close() {},
  querySelector(selector) {
    return ({"[data-close]":listener({}), "#manageMerchantForm":form,
      "[data-pickup-maps]":controls.maps, '[name="statusReason"]':controls.reason,
      "[data-open-quality]":controls.quality})[selector] || null;
  },
  querySelectorAll(selector) { return selector === "[data-listing-status]" ? [controls.active, controls.paused, controls.review] : []; }
};
const app = {
  innerHTML:"",
  querySelector() { return null; },
  querySelectorAll(selector) { return selector === "[data-manage-merchant]" ? [controls.manage] : []; }
};
const render = () => {};
const props = {store, app, modal, render, showToast(message) { throw Error(message); },
  esc:value => String(value ?? ""), money:value => `R${value / 100}`,
  directionsUrl:merchant => `https://maps.example/?destination=${encodeURIComponent(merchant.address || merchant.area || "")}`,
  choiceText:() => ""};

renderAdminWorkspace(props);
controls.manage.click();
const html = modal.innerHTML;
for (const label of ["Merchant details", "Pickup location", "Open Maps", "Save changes", "Trading status"]) assert(html.includes(label));
assert(html.indexOf("Merchant details") < html.indexOf("Pickup location"));
assert(html.indexOf("Pickup location") < html.indexOf("Save changes"));
assert(html.indexOf("Save changes") < html.indexOf("Trading status"));
assert.match(html, /Pause listing<\/button>/);
controls.address.value = "12 New Street, Midrand";
controls.address.input();
assert(controls.maps.href.includes("12%20New%20Street"), "Map link should follow the address being edited");
controls.paused.click();
assert.equal(state.merchants[0].listingStatus, "paused");
assert(state.events.some(event => event.type === "merchant_status_changed" && event.payload.reason === controls.reason.value));

controls.manage.dataset.manageMerchant = "m4";
renderAdminWorkspace(props);
controls.manage.click();
assert.match(modal.innerHTML, /data-listing-status="active" disabled/);
controls.quality.click();
assert.equal(state.adminTab, "quality", "Readiness review should open the real quality workspace");
console.log("Mobile merchant management workflow passed.");
