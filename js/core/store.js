import { seed } from "../data/seed.js";

const KEY = "goodkota_mvp_v7_state";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class Store {
  constructor() {
    const persisted = this.load();
    this.state = persisted || {
      ...clone(seed),
      role: "customer",
      customerTab: "discover",
      selectedMerchantId: null,
      search: "",
      filter: "All",
      cart: [],
      customerDetails: { firstName: "", lastName: "", email: "", phone: "" },
      merchantId: "m1",
      events: []
    };
    this.state.customerDetails ||= { firstName: "", lastName: "", email: "", phone: "" };
    this.state.location ||= "Midrand";
    this.state.locations ||= ["Midrand", "Tembisa", "Centurion"];
    if (!["All","Under R60","Chicken","Russian","Customisable"].includes(this.state.filter)) this.state.filter = "All";
    this.state.applications ||= [];
    this.state.supportCases ||= [];
    this.state.events ||= [];
    this.state.adminTab ||= "overview";
    this.state.merchantTab ||= "orders";
    this.state.merchants.forEach(merchant => {
      merchant.address ||= merchant.area;
      merchant.listingStatus ||= "active";
      merchant.quality ||= { status: "healthy", note: "" };
      merchant.contact ||= { name: "", phone: "", email: "" };
      merchant.tags ||= [];
      merchant.menu ||= [];
    });
    this.state.orders ||= [];
    this.state.orders.forEach(order => {
      if (!order.createdIso && order.createdAt && Number.isFinite(Date.parse(order.createdAt))) {
        order.createdIso = new Date(order.createdAt).toISOString();
      }
    });
    if (!this.merchant(this.state.merchantId)) this.state.merchantId = this.state.merchants[0]?.id;
  }

  load() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }

  save() {
    localStorage.setItem(KEY, JSON.stringify(this.state));
  }

  reset() {
    localStorage.removeItem(KEY);
    location.reload();
  }

  merchant(id) { return this.state.merchants.find(m => m.id === id); }
  product(id) {
    for (const merchant of this.state.merchants) {
      const product = merchant.menu.find(item => item.id === id);
      if (product) return { ...product, merchantId: merchant.id };
    }
    return null;
  }

  log(type, payload = {}) {
    this.state.events.push({ type, payload, at: new Date().toISOString() });
    this.state.events = this.state.events.slice(-200);
    this.save();
  }
}
