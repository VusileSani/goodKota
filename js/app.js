import { AppStore } from "./core/store.js";
import { defaultLocation, getCurrentPosition, rankOutletsByDistance, resolveArea } from "./services/location-service.js";
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
    this.selectedOutletId = null;
    this.demoMerchantId = this.store.state.merchants[0]?.id || null;
    this.demoDriverId = this.store.state.drivers[0]?.id || null;
    this.cart = [];
    this.deliveryMode = "Takeaway";
    this.paymentService = new DemoMarketplacePaymentService(this.store.state.platform.paymentGateway);
  }

  start() {
    this.bindShell();
    registerServiceWorker();
    this.render();
  }

  bindShell() {
    document.querySelectorAll("[data-route]").forEach(button => {
      button.addEventListener("click", () => this.navigate(button.dataset.route));
    });
    document.querySelector("#brandHome").addEventListener("click", () => this.navigate("customer"));

    this.dialog.addEventListener("click", event => {
      if (event.target === this.dialog) this.closeDialog();
      if (event.target.closest("[data-close-dialog]")) this.closeDialog();
    });
  }

  navigate(route) {
    this.route = route;
    document.querySelectorAll("[data-route]").forEach(button => button.classList.toggle("active", button.dataset.route === route));
    this.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  render() {
    this.store.refreshQualitySummaries(false);
    if (this.route === "merchant") return renderMerchantView(this);
    if (this.route === "driver") return renderDriverView(this);
    if (this.route === "delivery") return renderDeliveryOpsView(this);
    if (this.route === "admin") return renderAdminView(this);
    return renderCustomerView(this);
  }

  getRankedOutlets() {
    return rankOutletsByDistance(this.store.state.outlets, this.location);
  }

  async useCurrentLocation() {
    this.location = await getCurrentPosition();
    this.selectedOutletId = null;
    this.cart = [];
    this.render();
  }

  searchArea(query) {
    const result = resolveArea(query);
    if (!result) {
      alert("This Foundation demo recognises Midrand, Tembisa, Centurion, Ivory Park, Johannesburg, Pretoria, Soweto and Vereeniging. Production will use live geocoding.");
      return;
    }
    this.location = result;
    this.selectedOutletId = null;
    this.cart = [];
    this.render();
  }

  selectOutlet(outletId) {
    if (this.selectedOutletId !== outletId) this.cart = [];
    this.selectedOutletId = outletId;
    this.render();
    document.querySelector(".menu-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (!this.dialog.open) this.dialog.showModal();
  }

  closeDialog() {
    if (this.dialog.open) this.dialog.close();
    this.dialog.innerHTML = "";
  }

  toast(message) {
    const existing = document.querySelector("#appToast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.id = "appToast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: 200, maxWidth: "420px",
      background: "#111827", color: "white", padding: "13px 16px", borderRadius: "12px",
      boxShadow: "0 12px 30px rgba(0,0,0,.24)"
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  }

  async enableNearbyNotifications() {
    if (this.store.customer.notificationPreferences.nearbyQualityOutlets) {
      this.store.setNearbyNotifications(false);
      this.toast("Nearby GoodKota alerts disabled.");
      this.render();
      return;
    }

    try {
      await requestNotificationPermission();
      this.store.setNearbyNotifications(true);
      await showLocalNotification("GoodKota alerts are ready", {
        body: "Future proximity recommendations will be limited to outlets meeting the GoodKota Standard."
      });
      this.render();
    } catch (error) {
      alert(error.message);
    }
  }
}

const app = new GoodKotaApp();
app.start();
