import { AppStore } from "./core/store.js";
import { RepositoryHub } from "./repositories/repository-hub.js";
import { TelemetryService } from "./services/telemetry-service.js";
import { YagoyaCommandService } from "./services/command-service.js";
import { defaultLocation, getCurrentPosition, normalizeLocation, resolveArea } from "./services/location-service.js";
import { geocodeSouthAfricanAddress, suggestSouthAfricanLocations } from "./services/geocoding-service.js";
import { LocalMarketplacePaymentAdapter } from "./services/payment-service.js";
import { RetentionService } from "./services/retention-service.js";
import { JobService } from "./services/job-service.js";
import { isFeatureEnabled } from "./services/feature-flag-service.js";
import { registerServiceWorker, requestNotificationPermission, showLocalNotification } from "./services/notification-service.js";
import { renderCustomerView } from "./views/customer-view.js";
import { renderMerchantView } from "./views/merchant-view.js";
import { renderDriverView } from "./views/driver-view.js";
import { renderDeliveryOpsView } from "./views/delivery-ops-view.js";
import { renderAdminView } from "./views/admin-view.js";
import { renderOwnerView } from "./views/owner-view.js";
import { FirebaseAuthService } from "./infrastructure/firebase-auth-service.js";
import { friendlyAuthError } from "./services/auth-error-service.js";

class YagoyaApp {
  constructor() {
    this.root = document.querySelector("#app");
    this.dialog = document.querySelector("#appDialog");
    this.store = new AppStore();
    this.repos = new RepositoryHub(this.store);
    this.telemetry = new TelemetryService(this.store);
    this.route = "customer";
    this.location = defaultLocation();
    this.selectedMerchantId = null;
    this.currentMerchantId = this.repos.merchants.first()?.id || null;
    this.currentDriverId = this.repos.delivery.listDrivers({ limit: 1 }).items[0]?.id || null;
    this.cart = [];
    this.deliveryMode = "Takeaway";
    this.customerSection = "home";
    this.customerMenuQuery = "";
    this.customerCategory = "All";
    this.customerAccountPanel = null;
    this.customerAuthMode = "signin";
    this.customerAuthError = "";
    this.paymentService = new LocalMarketplacePaymentAdapter(this.repos.platform.paymentGateway());
    this.commands = new YagoyaCommandService({ store: this.store, paymentService: this.paymentService, telemetry: this.telemetry });
    this.retention = new RetentionService(this.store);
    this.jobs = new JobService(this.store, this.telemetry);
    this.merchantSection = "overview";
    this.merchantOrderFilter = "active";
    this.adminSection = "overview";
    this.adminMerchantQuery = "";
    this.adminOrderQuery = "";
    this.adminDriverQuery = "";
    this.ownerSection = "control";
    this.auth = new FirebaseAuthService();
    this.authUser = null;
    this.pendingCustomerAction = null;
  }

  start() {
    this.bindShell();
    this.bindAuthentication();
    this.applyDeepLink();
    this.renderBrandLinks();
    this.retention.enforce();
    this.processLocalBackgroundJobs();
    registerServiceWorker();
    this.render();

    const splash = document.querySelector("#brandSplash");
    window.setTimeout(() => splash?.classList.add("is-hidden"), 650);
    window.setTimeout(() => splash?.remove(), 1100);
  }


  bindAuthentication() {
    const authButton = document.querySelector("#authButton");
    authButton?.removeAttribute("hidden");
    authButton?.addEventListener("click", () => {
      this.route = "customer";
      this.customerSection = "account";
      this.customerAccountPanel = "security";
      this.customerAuthMode = this.authUser ? "account" : "signin";
      this.customerAuthError = "";
      const roleSelect = document.querySelector("#roleSelect");
      if (roleSelect) roleSelect.value = "customer";
      this.render();
      window.scrollTo(0, 0);
    });
    this.auth.onChange(user => {
      this.authUser = user;
      this.renderAuthControls();
      if (this.route === "customer" && this.customerSection === "account") this.render();
      if (user && this.pendingCustomerAction === "checkout") {
        this.pendingCustomerAction = null;
        this.customerSection = "cart";
        this.render();
        window.setTimeout(() => document.querySelector("#checkoutButton")?.click(), 0);
      }
    });
  }

  renderAuthControls() {
    const button = document.querySelector("#authButton");
    if (!button) return;
    if (!this.authUser) {
      button.hidden = false;
      button.textContent = "Sign in";
      button.setAttribute("aria-label", "Sign in to Yagoya");
      return;
    }
    button.hidden = false;
    button.textContent = this.authUser.displayName || this.authUser.email || "Account";
    button.setAttribute("aria-label", "Open Yagoya account");
  }

  openAuthDialog(mode = "signin") {
    const register = mode === "register";
    this.openDialog(`
      <div class="dialog-inner auth-dialog">
        <div class="dialog-head"><div><span class="eyebrow">Yagoya account</span><h2>${register ? "Create account" : "Sign in"}</h2></div><button class="icon-btn" data-close-dialog aria-label="Close">✕</button></div>
        <p class="muted">${register ? "Create a customer account. Merchant and platform authority are assigned separately." : "Use your Yagoya email and password."}</p>
        <form id="yagoyaAuthForm" class="form-grid">
          ${register ? '<label class="field full">Name<input name="name" autocomplete="name" required /></label>' : ''}
          <label class="field full">Email<input name="email" type="email" autocomplete="email" required /></label>
          <label class="field full">Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="6" required /></label>
          <div id="authError" class="auth-error field full" role="alert"></div>
          <div class="inline-actions field full"><button class="primary" type="submit">${register ? "Create account" : "Sign in"}</button><button class="secondary" type="button" id="authModeSwitch">${register ? "I already have an account" : "Create customer account"}</button></div>
        </form>
      </div>`);
    this.dialog.querySelector("#authModeSwitch")?.addEventListener("click", () => this.openAuthDialog(register ? "signin" : "register"));
    this.dialog.querySelector("#yagoyaAuthForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const errorHost = this.dialog.querySelector("#authError");
      errorHost.textContent = "";
      try {
        if (register) await this.auth.registerCustomer(form.get("name"), form.get("email"), form.get("password"));
        else await this.auth.signIn(form.get("email"), form.get("password"));
        this.closeDialog();
        this.toast(register ? "Yagoya account created." : "Signed in to Yagoya.");
      } catch (error) {
        errorHost.textContent = friendlyAuthError(error);
      }
    });
  }

  openAccountDialog() {
    const user = this.authUser;
    if (!user) return this.openAuthDialog("signin");
    this.openDialog(`
      <div class="dialog-inner auth-dialog">
        <div class="dialog-head"><div><span class="eyebrow">Yagoya account</span><h2>${user.displayName || "Signed in"}</h2></div><button class="icon-btn" data-close-dialog aria-label="Close">✕</button></div>
        <p class="muted">${user.email || "Authenticated account"}</p>
        <div class="inline-actions"><button class="secondary" type="button" id="signOutButton">Sign out</button></div>
      </div>`);
    this.dialog.querySelector("#signOutButton")?.addEventListener("click", async () => {
      await this.auth.signOut();
      this.closeDialog();
      this.toast("Signed out of Yagoya.");
    });
  }

  processLocalBackgroundJobs() {
    // The browser adapter preserves the asynchronous command boundary while testing.
    // Production workers execute these jobs from Cloud Tasks / scheduled Functions.
    const handlers = {
      order_notifications: payload => ({ accepted: true, orderId: payload.orderId }),
      order_status_notification: payload => ({ accepted: true, orderId: payload.orderId, status: payload.status }),
      driver_assignment_notification: payload => ({ accepted: true, taskId: payload.taskId, driverId: payload.driverId })
    };
    this.jobs.processBatch(handlers, 20);
  }

  applyDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const merchantId = params.get("merchant");
    if (merchantId && this.repos.merchants.get(merchantId)) {
      this.route = "customer";
      this.selectedMerchantId = merchantId;
      this.customerSection = "browse";
    }
  }

  renderBrandLinks() {
    const host = document.querySelector("#brandLinks");
    if (!host) return;
    const brand = this.repos.platform.brand();
    const social = brand.social || {};
    const links = [["Instagram", social.instagram], ["Facebook", social.facebook], ["TikTok", social.tiktok]].filter(([, url]) => /^https?:\/\//i.test(String(url || "")));
    host.innerHTML = `<a class="brand-link explore-link" href="${brand.publicWebsite || "./website.html"}">Explore Yagoya</a>${links.map(([label, url]) => `<a class="brand-link social-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Yagoya on ${label}">${label}</a>`).join("")}`;
  }

  renderActorContext() {
    const host = document.querySelector("#actorContext");
    if (!host) return;
    const contexts = {
      customer: ["Customer", "Nearby discovery, ordering and delivery"],
      merchant: ["Merchant", "Overview, orders, menu, quality, brand materials and store settings"],
      driver: ["Driver", "Current delivery, handover and support"],
      delivery: ["Delivery Ops", "Dispatch and live delivery control"],
      admin: ["Yagoya Admin", "Platform operations and stakeholder support"],
      owner: ["Yagoya Owner", "Company authority and protected controls"]
    };
    const [label, hint] = contexts[this.route] || contexts.customer;
    host.dataset.actor = this.route;
    host.innerHTML = `<div class="actor-context-inner"><span class="actor-context-label">${label}</span><span class="actor-context-hint">${hint}</span></div>`;
  }

  bindShell() {
    document.querySelector("#brandHome").addEventListener("click", () => this.navigate("customer"));
    document.querySelector("#roleSelect")?.addEventListener("change", event => this.navigate(event.currentTarget.value));

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
    const roleSelect = document.querySelector("#roleSelect");
    if (roleSelect) roleSelect.value = route;
    this.render();
    window.scrollTo(0, 0);
  }

  render() {
    document.body.classList.toggle("customer-route", this.route === "customer");
    document.body.dataset.route = this.route;
    this.renderActorContext();
    const controls = this.repos.platform.controls();
    if (controls.maintenanceMode && !["owner", "admin"].includes(this.route)) {
      this.root.innerHTML = `
        <section class="governance-hero compact">
          <div><span class="eyebrow">Yagoya</span><h2>Platform maintenance</h2><p>Yagoya is temporarily paused while the platform team completes an operational intervention.</p></div>
          <span class="status-pulse danger">Maintenance</span>
        </section>
        <section class="section"><div class="card"><strong>No action is required from you.</strong><p class="muted">Your existing records remain preserved. Normal service will return when the Owner releases maintenance mode.</p></div></section>`;
    } else if (this.route === "merchant") renderMerchantView(this);
    else if (this.route === "driver") renderDriverView(this);
    else if (this.route === "delivery") renderDeliveryOpsView(this);
    else if (this.route === "admin") renderAdminView(this);
    else if (this.route === "owner") renderOwnerView(this);
    else renderCustomerView(this);

    this.renderAnnouncementBanner();
    this.enhanceResponsiveTables(this.root);
  }

  platformActor(role = this.route) {
    return this.repos.governance.actor(role === "owner" ? "owner" : "admin");
  }

  renderAnnouncementBanner() {
    const routeAudience = { customer: "customers", merchant: "merchants", driver: "drivers", delivery: "operations", admin: "internal", owner: "internal" };
    const audience = routeAudience[this.route];
    const item = this.repos.governance.latestAnnouncement(audience);
    if (!item || this.root.querySelector(".platform-announcement")) return;
    const banner = document.createElement("div");
    banner.className = `platform-announcement ${item.severity || "info"}`;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const message = document.createElement("span");
    title.textContent = item.title;
    message.textContent = item.message;
    copy.append(title, message);
    banner.append(copy);
    this.root.prepend(banner);
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
    const customerId = this.repos.users.customer()?.id || "anonymous";
    const enabled = isFeatureEnabled(this.repos.platform.get(), "customerSearchV2", customerId);
    return this.repos.merchants.nearby(this.location, { radiusKm: enabled ? 35 : 20, limit: 30 }).items;
  }

  async useCurrentLocation() {
    return this.setCustomerLocation(await getCurrentPosition());
  }

  async searchArea(query) {
    const known = resolveArea(query);
    let result = known;
    if (!result) {
      const match = await geocodeSouthAfricanAddress(query);
      result = normalizeLocation({ lat: match.latitude, lng: match.longitude, label: match.address || match.area || String(query).trim(), type: match.placeType || "location", source: "geocoded", providerRef: match.providerRef });
    }
    return this.setCustomerLocation(result);
  }

  async suggestLocations(query, options = {}) {
    return suggestSouthAfricanLocations(query, options);
  }

  setCustomerLocation(location) {
    // Customer discovery location is session state only. We deliberately do not append
    // foreground search/GPS positions to operational history.
    this.location = normalizeLocation(location);
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
    this.customerAccountPanel = null;
    }
    this.selectedMerchantId = merchantId;
    this.customerSection = "browse";
    this.render();
    window.scrollTo(0, 0);
  }

  navigateCustomerSection(section) {
    this.customerSection = section;
    if (section !== "account") this.customerAccountPanel = null;
    this.render();
    window.scrollTo(0, 0);
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

  toast(message, options = {}) {
    const existing = document.querySelector("#appToast");
    existing?.remove();
    const toast = document.createElement("div");
    const tone = options.tone || "success";
    const title = options.title || "";
    toast.id = "appToast";
    toast.className = `app-toast ${tone}`;
    toast.setAttribute("role", tone === "warning" ? "alert" : "status");
    toast.setAttribute("aria-live", tone === "warning" ? "assertive" : "polite");
    toast.innerHTML = `<span class="app-toast-mark" aria-hidden="true">${tone === "warning" ? "!" : "✓"}</span><span><strong>${title || message}</strong>${title ? `<small>${message}</small>` : ""}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), Number(options.duration || 4200));
  }

  async enableNearbyNotifications() {
    if (this.store.customer.notificationPreferences.nearbyQualityMerchants) {
      this.commands.setNearbyNotifications(false);
      this.toast("Nearby Yagoya alerts disabled.");
      this.render();
      return;
    }

    try {
      await requestNotificationPermission();
      this.commands.setNearbyNotifications(true);
      await showLocalNotification("Yagoya alerts are ready", {
        body: "Future proximity recommendations will be limited to merchants meeting the Yagoya quality standard."
      });
      this.toast("Nearby quality alerts are now enabled.", { title: "Notification preference saved" });
      this.render();
    } catch (error) {
      alert(error.message);
    }
  }
}

const app = new YagoyaApp();
app.start();
