import test from "node:test";
import assert from "node:assert/strict";
import { AppStore } from "../js/core/store.js";
import { RepositoryHub } from "../js/repositories/repository-hub.js";
import { renderCustomerView } from "../js/views/customer-view.js";
import { renderMerchantView } from "../js/views/merchant-view.js";
import { renderDriverView } from "../js/views/driver-view.js";
import { renderDeliveryOpsView } from "../js/views/delivery-ops-view.js";
import { renderAdminView } from "../js/views/admin-view.js";
import { renderOwnerView } from "../js/views/owner-view.js";

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
  clear(){ this.map.clear(); }
}

class DummyElement {
  constructor(){ this.innerHTML=""; this.value=""; this.dataset={}; this.style={}; this.hidden=false; this.open=false; this.textContent=""; this.classList={add(){},remove(){},toggle(){}}; }
  addEventListener(){}
  querySelector(){ return new DummyElement(); }
  querySelectorAll(){ return []; }
  append(){}
  prepend(){}
  remove(){}
  close(){ this.open=false; }
  showModal(){ this.open=true; }
  setAttribute(){}
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = { scrollTo() {}, location: { search: "", href: "http://localhost/" } };
globalThis.document = { createElement(){ return new DummyElement(); } };

function buildApp(){
  localStorage.clear();
  const store = new AppStore();
  const repos = new RepositoryHub(store);
  const root = new DummyElement();
  const dialog = new DummyElement();
  const app = {
    store, repos, root, dialog,
    route: "customer",
    location: { lat: -25.9992, lng: 28.1263, label: "Midrand" },
    selectedMerchantId: null,
    currentMerchantId: repos.merchants.first()?.id || null,
    currentDriverId: repos.delivery.listDrivers({limit:1}).items[0]?.id || null,
    cart: [], deliveryMode: "Takeaway", customerSection: "home", customerMenuQuery: "", customerCategory: "All",
    adminSection: "overview", adminMerchantQuery: "", adminOrderQuery: "", adminDriverQuery: "", ownerSection: "control",
    commands: {},
    platformActor(role){ return repos.governance.actor(role); },
    getRankedMerchants(){ return repos.merchants.nearby(this.location,{radiusKm:35,limit:30}).items; },
    render(){}, toast(){}, openDialog(markup){ dialog.innerHTML=markup; }, closeDialog(){},
    navigateCustomerSection(){}, selectMerchant(){}, changeQuantity(){}, addToCart(){}, useCurrentLocation(){}, searchArea(){}, enableNearbyNotifications(){}
  };
  return app;
}

for (const [name, render, prepare] of [
  ["Customer", renderCustomerView, app => { app.customerSection="home"; }],
  ["Merchant", renderMerchantView, app => {}],
  ["Driver", renderDriverView, app => {}],
  ["Delivery Ops", renderDeliveryOpsView, app => {}],
  ["Yagoya Admin", renderAdminView, app => { app.adminSection="overview"; }],
  ["Yagoya Owner", renderOwnerView, app => { app.ownerSection="control"; }]
]) {
  test(`${name} primary view renders without a runtime exception`, () => {
    const app = buildApp();
    prepare(app);
    assert.doesNotThrow(() => render(app));
    assert.ok(app.root.innerHTML.length > 50);
  });
}

test("Customer secondary sections render without runtime exceptions", () => {
  for (const section of ["browse", "orders", "cart", "account"]) {
    const app = buildApp();
    app.customerSection = section;
    if (section === "browse" || section === "cart") app.selectedMerchantId = app.repos.merchants.first()?.id || null;
    assert.doesNotThrow(() => renderCustomerView(app), `Customer ${section} failed`);
    assert.ok(app.root.innerHTML.length > 50);
  }
});

test("Merchant sections render without runtime exceptions", () => {
  for (const section of ["overview", "orders", "reports", "menu", "quality", "brand", "settings", "support"]) {
    const app = buildApp();
    app.merchantSection = section;
    app.merchantOrderFilter = "active";
    assert.doesNotThrow(() => renderMerchantView(app), `Merchant ${section} failed`);
    assert.ok(app.root.innerHTML.length > 50);
  }
});

test("Yagoya Admin sections render without runtime exceptions", () => {
  for (const section of ["overview", "merchants", "applications", "drivers", "orders", "reports", "promotions", "support", "communications", "activity"]) {
    const app = buildApp();
    app.adminSection = section;
    assert.doesNotThrow(() => renderAdminView(app), `Admin ${section} failed`);
    assert.ok(app.root.innerHTML.length > 50);
  }
});

test("Yagoya Owner sections render without runtime exceptions", () => {
  for (const section of ["control", "authority", "brand", "integrity", "reports", "audit"]) {
    const app = buildApp();
    app.ownerSection = section;
    assert.doesNotThrow(() => renderOwnerView(app), `Owner ${section} failed`);
    assert.ok(app.root.innerHTML.length > 50);
  }
});
