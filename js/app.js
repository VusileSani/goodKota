import { AppStore } from "./core/store.js";
import { defaultLocation, getCurrentPosition, rankMerchantsByDistance, resolveArea } from "./services/location-service.js";
import { DemoMarketplacePaymentService } from "./services/payment-service.js";
import { registerServiceWorker, requestNotificationPermission, showLocalNotification } from "./services/notification-service.js";
import { renderCustomerView } from "./views/customer-view.js";
import { renderMerchantView } from "./views/merchant-view.js";
import { renderDriverView } from "./views/driver-view.js";
import { renderDeliveryOpsView } from "./views/delivery-ops-view.js";
import { renderAdminView } from "./views/admin-view.js";

class GoodKotaApp {
  constructor() {
    this.root = document.querySelector("#app");
    this.dialog = document.querySelector("#appDialog");
    this.store = new AppStore();
    this.route = "customer";
    this.location = defaultLocation();
    this.selectedMerchantId = null;
    this.demoMerchantId = this.store.state.merchants[0]?.id || null;
    this.demoDriverId = this.store.state.drivers[0]?.id || null;
    this.cart = [];
    this.deliveryMode = "Takeaway";
    this.customerSection = "home";
    this.customerMenuQuery = "";
    this.customerCategory = "All";
    this.paymentService = new DemoMarketplacePaymentService(this.store.state.platform.paymentGateway);
  }

  start() {
    this.bindShell();
    registerServiceWorker();
    this.render();

    const splash = document.querySelector("#brandSplash");
    window.setTimeout(() => splash?.classList.add("is-hidden"), 650);
    window.setTimeout(() => splash?.remove(), 1100);
  }

  bindShell() {
    document.querySelectorAll("[data-route]").forEach(button => {
      button.addEventListener("click", () => this.navigate(button.dataset.route));
    });
    document.querySelector("#brandHome").addEventListener("click", () => this.navigate("customer"));
    document.querySelector("#mobileRoleSelect")?.addEventListener("change", event => this.navigate(event.currentTarget.value));

    this.dialog.addEventListener("click", event => {
      if (event.target === this.dialog) this.closeDialog();
      if (event.target.closest("[data-close-dialog]")) this.closeDialog();
    });
    this.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.closeDialog();
    });
  }

  navigate(route) {
    this.route = route;
    document.querySelectorAll("[data-route]").forEach(button => button.classList.toggle("active", button.dataset.route === route));
    const roleSelect = document.querySelector("#mobileRoleSelect");
    if (roleSelect) roleSelect.value = route;
    this.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  render() {
    document.body.classList.toggle("customer-route", this.route === "customer");
    this.store.refreshQualitySummaries(false);
    if (this.route === "merchant") renderMerchantView(this);
    else if (this.route === "driver") renderDriverView(this);
    else if (this.route === "delivery") renderDeliveryOpsView(this);
    else if (this.route === "admin") renderAdminView(this);
    else renderCustomerView(this);
    this.enhanceResponsiveTables(this.root);
  }

  enhanceResponsiveTables(scope = document) {
    scope.querySelectorAll("table").forEach(table => {
      const headers = [...table.querySelectorAll("thead th")].map(header => header.textContent.trim());
      table.querySelectorAll("tbody tr").forEach(row => {
        [...row.children].forEach((cell, index) => {
          if (!cell.dataset.label) cell.dataset.label = headers[index] || "";
        });
      });
    });
  }

  getRankedMerchants() {
    return rankMerchantsByDistance(this.store.state.merchants, this.location);
  }

  async useCurrentLocation() {
    this.location = await getCurrentPosition();
    this.selectedMerchantId = null;
    this.cart = [];
    this.customerSection = "home";
    this.render();
    return true;
  }

  searchArea(query) {
    const result = resolveArea(query);
    if (!result) {
      alert("This Foundation demo recognises Midrand, Tembisa, Centurion, Ivory Park, Johannesburg, Pretoria, Soweto and Vereeniging. Production will use live geocoding.");
      return false;
    }
    this.location = result;
    this.selectedMerchantId = null;
    this.cart = [];
    this.customerSection = "home";
    this.render();
    return true;
  }

  selectMerchant(merchantId) {
    if (this.selectedMerchantId !== merchantId) {
      this.cart = [];
      this.customerMenuQuery = "";
      this.customerCategory = "All";
    }
    this.selectedMerchantId = merchantId;
    this.customerSection = "browse";
    this.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  navigateCustomerSection(section) {
    this.customerSection = section;
    this.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  addToCart(productId) {
    const existing = this.cart.find(line => line.productId === productId);
    if (existing) existing.qty += 1;
    else this.cart.push({ productId, qty: 1 });
    this.render();
  }

  changeQuantity(productId, delta) {
    const line = this.cart.find(item => item.productId === productId);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) this.cart = this.cart.filter(item => item.productId !== productId);
    this.render();
  }

  openDialog(markup) {
    this.dialog.innerHTML = markup;

    if (!this.dialog.open) {
      this.dialogScrollY = window.scrollY;
      document.documentElement.classList.add("dialog-open");
      document.body.classList.add("dialog-open");
      document.body.style.top = `-${this.dialogScrollY}px`;
      this.dialog.showModal();
    }

    this.enhanceResponsiveTables(this.dialog);
  }

  closeDialog() {
    if (this.dialog.open) this.dialog.close();
    this.dialog.innerHTML = "";

    if (document.body.classList.contains("dialog-open")) {
      const scrollY = Number(this.dialogScrollY || 0);
      document.documentElement.classList.remove("dialog-open");
      document.body.classList.remove("dialog-open");
      document.body.style.top = "";
      this.dialogScrollY = 0;
      window.scrollTo(0, scrollY);
    }
  }

  toast(message) {
    const existing = document.querySelector("#appToast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.id = "appToast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: 200, maxWidth: "min(420px, calc(100vw - 28px))",
      background: "#2b211e", color: "white", padding: "13px 16px", borderRadius: "12px",
      boxShadow: "0 12px 30px rgba(0,0,0,.24)"
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  }

  async enableNearbyNotifications() {
    if (this.store.customer.notificationPreferences.nearbyQualityMerchants) {
      this.store.setNearbyNotifications(false);
      this.toast("Nearby GoodKota alerts disabled.");
      this.render();
      return;
    }

    try {
      await requestNotificationPermission();
      this.store.setNearbyNotifications(true);
      await showLocalNotification("GoodKota alerts are ready", {
        body: "Future proximity recommendations will be limited to merchants meeting the GoodKota Standard."
      });
      this.render();
    } catch (error) {
      alert(error.message);
    }
  }
}

const app = new GoodKotaApp();
app.start();
