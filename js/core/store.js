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
      merchantId: "m1",
      events: []
    };
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
