import { distanceTo, formatDistance } from "./core/geo.js";
import { Store } from "./core/store.js";
import { STANDARD } from "./data/seed.js";
import { canOrder, isPick, submitApplication, saveMerchant, transitionOrder, createCase, requestRefundReview } from "./core/operations.js";
import { buildPickupOrder } from "./core/checkout.js";
import { EXPERIENCE, merchantExperience, rateCompletedOrder } from "./core/feedback.js";
import { choicesFor, choiceLabel, selectedChoices, sameChoice } from "./core/menu-choices.js";
import { renderAdminWorkspace } from "./views/admin-view.js";
import { PAYFAST_SIGNUP_URL, PAYFAST_DASHBOARD_URL, payfastAccount, submitPayfastAccount } from "./core/payfast-onboarding.js";

let store;
let actor = null;
let firebaseMode = false;
let mailResendAvailable = false;
let orderReadyEmailAvailable = false;
let firebaseClient;
let refreshTimer;
const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");
const accountButton = document.querySelector("#accountButton");
const locationLabel = document.querySelector("#locationLabel");
const locationButton = document.querySelector("#locationButton");

const money = cents => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const standardPass = isPick;
const firstLetter = text => esc(String(text).trim().slice(0,1).toUpperCase());
const directionsUrl = merchant => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(merchant?.address || merchant?.area || "")}`;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function render() {
  if (!store) return;
  accountButton.textContent = actor ? actor.role === "admin" ? "GoodKota account" : actor.role === "merchant" ? "Merchant account" : "My account" : "Sign in";
  locationButton.hidden = actor?.role === "merchant" || actor?.role === "admin";
  locationLabel.textContent = store.state.location;
  if (store.state.role === "merchant") renderMerchant();
  else if (store.state.role === "admin") renderAdminWorkspace({store, app, modal, render, showToast, esc, money, directionsUrl, choiceText, notificationCapabilities:{inApp:true,email:orderReadyEmailAvailable}});
  else renderCustomer();
  if (actor && !actor.emailVerified) {
    app.insertAdjacentHTML("afterbegin", `<section class="verification-banner" role="status"><div><strong>Verify your email</strong><p>Check ${esc(actor.email)} for a link. Open it before placing orders or managing a store.</p></div><button class="btn ghost small" type="button" data-resend-email>Resend link</button></section>`);
    app.querySelector("[data-resend-email]")?.addEventListener("click", resendEmail);
  }
  bindCommon(app);
}

async function resendEmail() {
  if (firebaseMode && !mailResendAvailable) { openEmailResend(); return; }
  try {
    const response = await fetch("./api/auth/resend-verification", {method:"POST",credentials:"same-origin"});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    showToast("Verification link sent. Check your email.");
  } catch (error) { showToast(error.message || "Could not send email."); }
}

function openEmailResend() {
  modal.innerHTML = `<form class="modal-body editor-form" id="resendForm"><div class="modal-head"><div><div class="eyebrow">Account security</div><h2>Send a fresh link</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p>Confirm your password to send a verification link to ${esc(actor.email)}.</p><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">Send verification link</button><p class="muted" id="authError" role="alert"></p></form>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try { firebaseClient ||= await import("./firebase-client.bundle.js"); await firebaseClient.signIn(actor.email,new FormData(form).get("password")); await firebaseClient.sendCurrentVerification(); await firebaseClient.clearClient(); modal.close(); showToast("Verification link sent."); }
    catch (error) { form.querySelector("#authError").textContent = error.message || "Could not send the link."; button.disabled = false; }
  });
}

function bindCommon(root) {
  root.querySelectorAll("[data-open-merchant]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    store.state.selectedMerchantId = button.dataset.openMerchant;
    store.log("merchant_open", { merchantId: button.dataset.openMerchant });
    render();
  }));

  root.querySelectorAll("[data-favourite]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    if (!actor) { openAccess(); return; }
    const id = button.dataset.favourite;
    const set = new Set(store.state.favourites);
    set.has(id) ? set.delete(id) : set.add(id);
    store.state.favourites = [...set];
    store.log("favourite_toggle", { merchantId: id, active: set.has(id) });
    render();
  }));

  root.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => addToCart(button.dataset.add)));
  root.querySelectorAll("[data-cart]").forEach(button => button.addEventListener("click", openCart));
  root.querySelectorAll("[data-directions]").forEach(link => link.addEventListener("click", event => {
    event.stopPropagation();
    store.log("directions_open", { merchantId: link.dataset.directions });
  }));
}

function renderCustomer() {
  if (store.state.selectedMerchantId) {
    app.innerHTML = merchantDetail(store.merchant(store.state.selectedMerchantId));
    if (cartCount()) app.insertAdjacentHTML("beforeend", bottomCart(true));
    return;
  }

  const tab = store.state.customerTab;
  app.innerHTML = tab === "saved" ? savedView() : tab === "orders" ? ordersView() : tab === "account" ? accountView() : discoverView();
  if (cartCount()) app.insertAdjacentHTML("beforeend", bottomCart());
  app.insertAdjacentHTML("beforeend", customerNav());

  app.querySelectorAll("[data-customer-tab]").forEach(button => button.addEventListener("click", () => {
    store.state.customerTab = button.dataset.customerTab;
    store.save();
    render();
  }));

  const search = app.querySelector("#discoverSearch");
  if (search) {
    search.value = store.state.search;
    search.addEventListener("input", () => {
      store.state.search = search.value;
      store.save();
      updateMerchantGrid();
    });
  }
  app.querySelector("#useMyLocation")?.addEventListener("click", useMyLocation);
  app.querySelector("#findKota")?.addEventListener("click", () => app.querySelector("#merchantGrid")?.scrollIntoView({ behavior: "smooth" }));
  app.querySelector("#detailsForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const result = await store.log("customer_details_saved", {fields});
    if (result?.ok) showToast("Details saved");
    else button.disabled = false;
  });
  app.querySelector("#enableDeviceAlerts")?.addEventListener("click", async () => {
    try {
      const permission = await Notification.requestPermission();
      showToast(permission === "granted" ? "Device alerts enabled" : "Device alerts remain off");
      render();
    } catch { showToast("Device alerts are not available in this browser"); }
  });
  app.querySelectorAll("[data-read-notification]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    const result = await store.log("notification_read", {id:button.dataset.readNotification});
    if (!result?.ok) button.disabled = false;
  }));
  app.querySelector("#merchantApplication")?.addEventListener("click", openMerchantApplication);
  app.querySelectorAll("[data-cancel-own-order]").forEach(button => button.addEventListener("click", async () => {
    if (!confirm("Cancel this order?")) return;
    button.disabled = true;
    const result = await store.log("order_cancelled_by_customer", {orderId: button.dataset.cancelOwnOrder});
    if (result?.ok) showToast("Order cancelled");
  }));
  app.querySelectorAll("[data-rate-order]").forEach(button => button.addEventListener("click", () => openExperience(button.dataset.rateOrder)));

}

function discoverView() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">The kota authority</div>
        <h1>Good kota.<br>Near you.</h1>
        <p>Find the kota worth eating, close to where you are.</p>
        <label class="searchbar">
          <input id="discoverSearch" type="search" placeholder="Search kota spots, menu items or areas" autocomplete="off" />
          <button class="btn primary" type="button" id="findKota">Find kota</button>
          <button class="btn light" type="button" id="useMyLocation">${store.state.userPos ? "Location on ✓" : "Use my location"}</button>
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Where the good kota is</h2><p>Start around ${esc(store.state.location)}. Search by spot, menu item or area.</p></div>
      </div>
      <div class="merchant-grid" id="merchantGrid">${merchantCards(filteredMerchants())}</div>
    </section>`;
}

const kmLabel = merchant => {
  const km = distanceTo(store.state.userPos, merchant);
  return km == null ? "" : `${formatDistance(km)} away`;
};

function useMyLocation() {
  if (!navigator.geolocation) { showToast("Location isn't available on this device. Choose your area instead."); return; }
  showToast("Finding kota near you…");
  navigator.geolocation.getCurrentPosition(position => {
    // Kept in memory only: never saved to storage and never sent to the server.
    store.state.userPos = {lat: position.coords.latitude, lng: position.coords.longitude};
    render();
    showToast("Sorted by distance from you");
  }, error => {
    showToast(error.code === 1 ? "Location is off for GoodKota. Choose your area instead." : "Couldn't get your location. Choose your area instead.");
  }, {enableHighAccuracy: false, timeout: 10000, maximumAge: 300000});
}

function filteredMerchants() {
  const q = store.state.search.trim().toLowerCase();
  const near = m => m.area.toLowerCase().includes(store.state.location.toLowerCase()) ? 0 : 1;
  const products = m => m.menu.filter(item => item.available);
  return store.state.merchants
    .filter(m => m.listingStatus === "active")
    .filter(m => !q || `${m.name} ${m.area} ${m.tags.join(" ")} ${products(m).map(item => `${item.name} ${item.desc} ${choicesFor(item).filter(choice => choice.available !== false).map(choice => choice.name).join(" ")}`).join(" ")}`.toLowerCase().includes(q))
    .sort((a,b) => store.state.userPos
      ? Number(canOrder(b)) - Number(canOrder(a)) || (distanceTo(store.state.userPos,a) ?? Infinity) - (distanceTo(store.state.userPos,b) ?? Infinity)
      : near(a) - near(b) || Number(canOrder(b)) - Number(canOrder(a)));
}

function updateMerchantGrid() {
  const grid = app.querySelector("#merchantGrid");
  if (!grid) return;
  grid.innerHTML = merchantCards(filteredMerchants());
  bindCommon(grid);
}

function merchantCards(merchants) {
  if (!merchants.length) return `<div class="empty">No kota spots match that search yet.</div>`;
  return merchants.map(m => {
    const feedback = merchantExperience(store.state, m.id);
    const signature = m.menu.find(item => item.available);
    return `
    <article class="merchant-card" data-open-merchant="${m.id}">
      <div class="merchant-card-top">
        <div class="merchant-monogram">${firstLetter(m.name)}</div>
        <button class="link-button" data-favourite="${m.id}" aria-label="${store.state.favourites.includes(m.id) ? "Remove favourite" : "Save favourite"}">${store.state.favourites.includes(m.id) ? "♥" : "♡"}</button>
      </div>
      <div class="merchant-photo" aria-hidden="true"><span>${esc(signature?.emoji || "🥪")}</span><small>Food photo coming soon</small></div>
      <h3>${esc(m.name)}</h3>
      ${signature ? `<div class="signature-line">Try ${esc(signature.name)} · ${money(signature.price)}</div>` : ""}
      <div class="address"><a href="${directionsUrl(m)}" target="_blank" rel="noopener noreferrer" data-directions="${m.id}" aria-label="Navigate to ${esc(m.name)}">${esc(m.address || m.area)} ↗</a></div>
      <div class="merchant-facts">
        ${kmLabel(m) ? `<span><strong>${kmLabel(m)}</strong></span>` : ""}
        <span>~${m.prepMinutes} min</span>
        <span class="experience-dot ${feedback.tone}"></span><span>${feedback.count >= 3 ? `${feedback.label} · ${feedback.count} orders` : feedback.count ? `${feedback.count} pickup rating${feedback.count === 1 ? "" : "s"}` : "Feedback pending"}</span>
        <span class="badge ${m.online ? "green" : "dark"}">${m.online ? "Open now" : "Closed"}</span>
      </div>
      <div class="card-bottom">
        ${standardPass(m) ? `<span class="badge orange">✓ GoodKota Pick</span>` : `<span class="badge amber">Under review</span>`}
        <button class="link-button" data-open-merchant="${m.id}">View menu →</button>
      </div>
    </article>`;
  }).join("");
}

function merchantDetail(merchant) {
  if (!merchant) return `<div class="empty">Merchant not found.</div>`;
  const feedback = merchantExperience(store.state, merchant.id);
  return `
    <section class="detail-hero">
      <button class="link-button back" id="backDiscover">← Back to nearby</button>
      <div class="eyebrow">${standardPass(merchant) ? "GoodKota Pick" : "Quality review"}</div>
      <h1>${esc(merchant.name)}</h1>
      <p>${esc(merchant.address || merchant.area)}${kmLabel(merchant) ? ` · ${kmLabel(merchant)}` : ""}${feedback.count >= 3 ? ` · ${feedback.label} from ${feedback.count} collected orders` : ""}</p>
      <div class="detail-actions">
        <a class="btn primary" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer" data-directions="${merchant.id}">Get directions ↗</a>
        <button class="btn light" data-favourite="${merchant.id}">${store.state.favourites.includes(merchant.id) ? "♥ Saved" : "♡ Save"}</button>
      </div>
    </section>

    <div class="detail-layout">
      <section class="panel">
        <div class="section-head"><div><h2>Order for pickup</h2></div></div>
        <div class="menu-list">
          ${merchant.menu.map(item => `<article class="menu-item"><div class="product-visual" aria-hidden="true">${esc(item.emoji || "🥪")}</div><div class="product-copy"><h4>${esc(item.name)}</h4><p>${esc(item.desc)}</p><strong class="price">${money(item.price)}</strong></div><button class="product-add" data-add="${item.id}" aria-label="Choose ${esc(item.name)} options" ${item.available && canOrder(merchant) ? "" : "disabled"}>${item.available && canOrder(merchant) ? "Add +" : item.available ? "Closed" : "Sold out"}</button></article>`).join("")}
        </div>
      </section>
      <aside class="panel"><h2>Pickup details</h2><p class="muted">${esc(merchant.note)}</p><p>${merchant.online ? "● Open for orders" : "Closed"} · Usually ready in ~${merchant.prepMinutes} minutes</p><a class="text-link" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer">Open in Maps ↗</a></aside>
    </div>`;
}

function savedView() {
  const merchants = store.state.merchants.filter(m => m.listingStatus === "active" && store.state.favourites.includes(m.id));
  return `<div class="page-title"><div class="eyebrow">Favourites</div><h1>Saved kota spots</h1></div><div class="merchant-grid">${merchantCards(merchants)}</div>`;
}

function ordersView() {
  const orders = store.state.orders;
  return `<div class="page-title"><div class="eyebrow">Pickup</div><h1>Your orders</h1></div><section class="panel stack">${orders.map(orderRow).join("") || `<div class="empty">No orders yet.</div>`}</section>`;
}

function orderRow(order) {
  const merchant = store.merchant(order.merchantId);
  const tone = order.status === "cancelled" ? "red" : order.status === "completed" ? "green" : order.status === "ready" ? "orange" : "dark";
  return `<div class="list-row"><div><strong>${esc(merchant?.name || "GoodKota")}</strong><p>${esc(order.id)} · ${esc(order.createdAt)} · Pay on collection</p><p>${order.items.map(line => `${line.qty} × ${esc(line.name || store.product(line.productId)?.name || "Item")}${choiceText(line) ? ` (${esc(choiceText(line))})` : ""}`).join(" · ")}</p>${order.cancelReason ? `<p>Cancelled: ${esc(order.cancelReason)}</p>` : ""}${merchant ? `<a class="text-link" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer" data-directions="${merchant.id}">Get directions ↗</a>` : ""}${order.status === "new" ? `<p><button class="btn ghost small" data-cancel-own-order="${esc(order.id)}">Cancel order</button></p>` : ""}${order.status === "completed" ? order.experience ? `<p><span class="badge ${EXPERIENCE[order.experience.value]?.tone || "dark"}">Your experience: ${esc(EXPERIENCE[order.experience.value]?.label || "Rated")}</span></p>` : `<p><button class="btn primary small" data-rate-order="${esc(order.id)}">Rate this pickup</button></p>` : ""}</div><div class="list-row-actions"><span class="badge ${tone}">${esc(order.status)}</span><strong>${money(order.total)}</strong></div></div>`;
}

function openExperience(orderId) {
  const order = store.state.orders.find(item => item.id === orderId);
  if (!order || order.status !== "completed" || order.experience) return;
  modal.innerHTML = `<div class="modal-body"><div class="modal-head"><div><div class="eyebrow">Collected order</div><h2>How was ${esc(store.merchant(order.merchantId)?.name || "your kota")}?</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div><p class="muted">Rate the food and pickup experience for order ${esc(order.id)}.</p><div class="experience-choices">${Object.entries(EXPERIENCE).map(([value, item]) => `<button class="experience-choice ${item.tone}" data-experience="${value}"><span class="experience-dot ${item.tone}"></span>${item.label}</button>`).join("")}</div></div>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelectorAll("[data-experience]").forEach(button => button.addEventListener("click", () => {
    try { rateCompletedOrder(store, orderId, button.dataset.experience); modal.close(); showToast("Thanks for rating your pickup"); render(); }
    catch (error) { showToast(error.message); }
  }));
}

function accountView() {
  if (!actor) return `<div class="page-title"><div class="eyebrow">Your GoodKota</div><h1>Make it yours</h1></div><section class="panel account-panel"><p>Explore kota spots freely. Sign in when you are ready to order, save spots or view your pickups.</p><button class="btn primary" type="button" id="guestSignIn">Sign in or create account</button></section>`;
  const details = store.state.customerDetails || {};
  const notices = (store.state.notifications || []);
  const unread = notices.filter(n => !n.readAt).length;
  const deviceAlerts = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const notificationPanel = `<section class="panel account-panel section"><div class="section-head"><div><h2>Order alerts ${unread ? `(${unread} new)` : ""}</h2><p>Ready updates are saved here automatically.${orderReadyEmailAvailable ? " Email ready alerts are also active." : ""}</p></div>${deviceAlerts === "granted" ? `<span class="badge green">Device alerts on</span>` : deviceAlerts !== "unsupported" ? `<button class="btn ghost small" type="button" id="enableDeviceAlerts">Enable device alerts</button>` : ""}</div>${deviceAlerts !== "unsupported" && deviceAlerts !== "granted" ? `<p class="muted">Device alerts work while GoodKota is open in your browser. Your in-app notification history is retained either way.</p>` : ""}${notices.length ? notices.map(n => `<div class="list-row"><div><strong>${esc(n.message)}</strong><p>${esc(n.orderId)} · ${new Date(n.createdAt).toLocaleString("en-ZA", {dateStyle:"medium",timeStyle:"short"})}</p></div>${n.readAt ? `<span class="badge">Read</span>` : `<button class="btn ghost small" data-read-notification="${esc(n.id)}">Mark read</button>`}</div>`).join("") : `<p class="muted">No order alerts yet.</p>`}</section>`;
  return `<div class="page-title"><div class="eyebrow">Account</div><h1>Your details</h1><p>Saved once and reused for future pickup orders.</p></div><section class="panel account-panel"><form id="detailsForm" class="checkout-fields">
    <label>First name<input name="firstName" autocomplete="given-name" required maxlength="80" value="${esc(details.firstName)}"></label>
    <label>Last name<input name="lastName" autocomplete="family-name" required maxlength="80" value="${esc(details.lastName)}"></label>
    <label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="30" value="${esc(details.phone)}"></label>
    <label>Email address<input name="email" type="email" autocomplete="email" readonly value="${esc(actor.email || details.email)}"><small class="muted">Your sign-in email is used for order communication.</small></label>
    <button class="btn primary" type="submit">Save details</button>
  </form></section>${notificationPanel}<section class="panel account-panel section"><h2>Own a kota spot?</h2><p class="muted">Tell us about your business and where customers can collect. Once approved, we will guide you through setting up your own PayFast account.</p><button class="btn ghost" id="merchantApplication">Apply to list your spot</button></section>`;
}

function openMerchantApplication() {
  if (!actor) { openAccess(); return; }
  const details = store.state.customerDetails || {};
  modal.innerHTML = `<form class="modal-body editor-form" id="applyForm"><div class="modal-head"><div><div class="eyebrow">GoodKota merchants</div><h2>List your kota spot</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div>
    <div class="editor-pair"><label>Trading name<input name="businessName" required maxlength="80"></label><label>Area<input name="area" required maxlength="80" value="${esc(store.state.location || "")}"></label></div>
    <label>Pickup address<input name="address" required autocomplete="street-address" placeholder="Street address customers can navigate to"></label>
    <div class="editor-pair"><label>Contact name<input name="contactName" required autocomplete="name" value="${esc([details.firstName,details.lastName].filter(Boolean).join(" "))}"></label><label>Mobile number<input name="phone" type="tel" required autocomplete="tel" value="${esc(details.phone || "")}"></label></div>
    <label>Email<input name="email" type="email" required autocomplete="email" value="${esc(actor.email || details.email || "")}"></label><label>About your spot<textarea name="note" rows="3" placeholder="What makes your kota special?"></textarea></label>
    <p class="muted">Next: set up your menu and your own PayFast account. You can apply before you have an account.</p>
    <button class="btn primary" type="submit">Send application</button></form>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try {
      submitApplication(store, Object.fromEntries(new FormData(event.currentTarget)));
      modal.close(); showToast("Application received");
    } catch (error) { showToast(error.message); }
  });
}

function customerNav() {
  const tabs = [["discover","⌂","Discover"],["saved","♡","Saved"],["orders","≡","Orders"],["account","●","Account"]];
  const unread = (store.state.notifications || []).filter(item => !item.readAt).length;
  return `<nav class="bottom-nav" aria-label="Customer navigation">${tabs.map(([id,icon,label]) => `<button class="${store.state.customerTab === id ? "active" : ""}" data-customer-tab="${id}"><span>${icon}</span>${label}${id === "account" && unread ? `<b class="nav-count" aria-label="${unread} unread order alerts">${unread > 9 ? "9+" : unread}</b>` : ""}</button>`).join("")}</nav>`;
}

function bottomCart(onMerchantDetail = false) {
  const count = cartCount();
  const total = money(cartTotal());
  return `${onMerchantDetail ? "" : `<div class="cart-dock-spacer" aria-hidden="true"></div>`}<button class="cart-dock ${onMerchantDetail ? "detail" : ""}" type="button" data-cart aria-label="View cart, ${count} ${count === 1 ? "item" : "items"}, ${total}"><span class="cart-dock-label">View cart <span class="cart-dock-count">${count}</span></span><span class="cart-dock-total">${total}<span aria-hidden="true"> →</span></span></button>`;
}

// A choice is bound to one item. Store a price and label snapshot so later menu edits
// cannot silently change the price or contents of an order already placed.
const linePrice = line => line.unitPrice ?? store.product(line.productId)?.price ?? 0;
const choiceText = line => (line.choices || []).map(choiceLabel).join(" · ");

function addToCart(productId) {
  const product = store.product(productId);
  if (!product || !product.available || !canOrder(store.merchant(product.merchantId))) return;
  const choices = choicesFor(product);
  const optionLine = choice => `<label class="choice-row"><input type="checkbox" data-choice value="${esc(choice.id)}" ${choice.available === false ? "disabled" : ""}><span><strong>${esc(choiceLabel(choice))}</strong>${choice.available === false ? `<small>Unavailable</small>` : ""}</span><b>${choice.price ? `+ ${money(choice.price)}` : "Free"}</b></label>`;
  const groups = [...new Set(choices.filter(choice => choice.kind === "select").map(choice => choice.group).filter(Boolean))];
  const pickOne = groups.map((group, index) => `<fieldset class="choice-group"><legend>${esc(group)} <small>Choose one, or keep it as listed</small></legend><label class="choice-row"><input type="radio" name="group-${index}" checked value="">As listed <b>Included</b></label>${choices.filter(choice => choice.kind === "select" && choice.group === group).map(choice => `<label class="choice-row"><input type="radio" name="group-${index}" data-choice value="${esc(choice.id)}" ${choice.available === false ? "disabled" : ""}><span>${esc(choice.name)}${choice.available === false ? `<small>Unavailable</small>` : ""}</span><b>${choice.price ? `+ ${money(choice.price)}` : "Free"}</b></label>`).join("")}</fieldset>`).join("");
  modal.innerHTML = `<form class="modal-body" id="optionsForm"><div class="modal-head"><div><div class="eyebrow">Your kota, your way</div><h2>${esc(product.name)}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p class="muted">${esc(product.desc)}</p><div class="choice-list">${choices.some(choice => choice.kind === "add") ? `<h3>Make it bigger</h3>${choices.filter(choice => choice.kind === "add").map(optionLine).join("")}` : ""}${choices.some(choice => choice.kind === "remove") ? `<h3>Leave it out</h3>${choices.filter(choice => choice.kind === "remove").map(optionLine).join("")}` : ""}${pickOne || ""}${!choices.length ? `<p class="muted">No changes needed? Add it as it comes.</p>` : ""}</div><div class="cart-total"><span>Total per item</span><span id="optionsTotal">${money(product.price)}</span></div><button class="btn primary wide" type="submit">Add to cart</button></form>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  const form = modal.querySelector("#optionsForm");
  const selected = () => selectedChoices(product, [...form.querySelectorAll("[data-choice]:checked")].map(input => input.value));
  form.addEventListener("change", () => { form.querySelector("#optionsTotal").textContent = money(product.price + selected().reduce((sum, choice) => sum + choice.price, 0)); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const current = store.product(productId);
    if (!current?.available || !canOrder(store.merchant(current.merchantId))) { modal.close(); showToast("Item no longer available"); return; }
    let options;
    try { options = selected(); } catch (error) { showToast(error.message); return; }
    const live = choicesFor(current);
    if (current.price !== product.price || options.some(option => !live.some(choice => sameChoice(option, choice)))) {
      modal.close(); showToast("Menu changed. Please choose again."); render(); return;
    }
    const previousMerchant = store.state.cart[0] && store.product(store.state.cart[0].productId)?.merchantId;
    if (previousMerchant && previousMerchant !== current.merchantId) {
      if (!window.confirm("Your cart has food from another spot. Clear it and start a new order?")) return;
      store.state.cart = [];
    }
    const ids = options.map(choice => choice.id).sort().join("|");
    const line = store.state.cart.find(item => item.productId === productId && (item.choices || []).map(choice => choice.id).sort().join("|") === ids);
    if (line) line.qty += 1;
    else store.state.cart.push({productId, qty: 1, name: current.name, unitPrice: current.price + options.reduce((sum, choice) => sum + choice.price, 0), choices: options.map(({id,name,kind,group,price}) => ({id,name,kind,group: group || "",price}))});
    store.log("cart_add", {productId, merchantId: current.merchantId});
    modal.close(); showToast(`${current.name} added`); render();
  });
}

function cartCount() { return store.state.cart.reduce((sum, line) => sum + line.qty, 0); }
function cartTotal() { return store.state.cart.reduce((sum, line) => sum + linePrice(line) * line.qty, 0); }

function openCart() {
  const lines = store.state.cart.map((line, index) => {
    const product = store.product(line.productId);
    return product ? `<div class="cart-line"><div><strong>${esc(line.name || product.name)}</strong><div class="muted">${esc(choiceText(line)) || "As it comes"} · ${money(linePrice(line))} each</div></div><div class="qty"><button data-qty="-1" data-line="${index}" aria-label="Remove one ${esc(product.name)}">−</button><strong>${line.qty}</strong><button data-qty="1" data-line="${index}" aria-label="Add one ${esc(product.name)}">+</button></div><strong>${money(linePrice(line) * line.qty)}</strong></div>` : "";
  }).join("");
  const details = store.state.customerDetails;
  const pickupMerchant = store.product(store.state.cart[0]?.productId)?.merchantId;
  const pickup = store.merchant(pickupMerchant);
  modal.innerHTML = `<div class="modal-body"><div class="modal-head"><div><div class="eyebrow">Pickup order</div><h2>Your cart</h2></div><button class="modal-close" data-close aria-label="Close cart">×</button></div><div class="cart-items">${lines || `<div class="empty">Your cart is empty.</div>`}</div>${store.state.cart.length ? `<div class="cart-total"><span>Total</span><span>${money(cartTotal())}</span></div><p class="pickup-detail">Collect from ${esc(pickup?.name || "the merchant")} · <a class="text-link" href="${directionsUrl(pickup)}" target="_blank" rel="noopener noreferrer">Get directions ↗</a></p><form id="checkoutForm" class="checkout-fields">
    <div class="checkout-identity"><strong>${esc([details.firstName, details.lastName].filter(Boolean).join(" ") || "Your contact details")}</strong><p class="muted">${esc(details.phone || "Add your mobile number in Account")}</p><button type="button" class="btn ghost small" id="editCheckoutProfile">Edit in Account</button></div>
    <div class="payment-choice"><strong>Payment</strong><span>Pay on collection</span></div>
    <button class="btn primary checkout-submit" type="submit">Place pickup order</button>
  </form>` : ""}</div>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelectorAll("[data-qty]").forEach(button => button.addEventListener("click", () => {
    const line = store.state.cart[Number(button.dataset.line)];
    if (!line) return;
    line.qty += Number(button.dataset.qty);
    if (line.qty <= 0) store.state.cart.splice(Number(button.dataset.line), 1);
    store.save(); modal.close(); render(); openCart();
  }));
  modal.querySelector("#editCheckoutProfile")?.addEventListener("click", () => { modal.close(); store.state.customerTab = "account"; render(); });
  modal.querySelector("#checkoutForm")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const saved = store.state.customerDetails || {};
    if (!saved.firstName || !saved.lastName || !saved.phone || !saved.email) { modal.close(); store.state.customerTab = "account"; render(); showToast("Complete your account details before ordering"); return; }
    placeOrder(saved);
  });
}

function placeOrder(details) {
  if (!actor) { modal.close(); openAccess(); return; }
  if (!store.state.cart.length) return;
  const product = store.product(store.state.cart[0].productId);
  const stale = store.state.cart.some(line => {
    const current = store.product(line.productId);
    const live = choicesFor(current);
    if (!current?.available || current.merchantId !== product?.merchantId) return true;
    try { selectedChoices(current, (line.choices || []).map(choice => choice.id)); } catch { return true; }
    return (line.name && line.name !== current.name) || linePrice(line) !== current.price + (line.choices || []).reduce((sum, option) => sum + option.price, 0) || (line.choices || []).some(option => !live.some(choice => sameChoice(option, choice)));
  });
  if (!product || stale || !canOrder(store.merchant(product.merchantId))) {
    showToast("Menu changed. Review your cart before ordering"); modal.close(); render(); return;
  }
  let order;
  try { order = buildPickupOrder(details, store.merchant(product.merchantId), store.state.cart.map(line => ({...line, unitPrice: linePrice(line)}))); }
  catch (error) { showToast(error.message); return; }
  const cartBefore = structuredClone(store.state.cart);
  store.state.customerDetails = order.customerDetails;
  store.state.orders.unshift(order);
  store.state.cart = []; store.state.customerTab = "orders"; store.state.selectedMerchantId = null;
  modal.close(); render();
  store.log("pickup_order_created", {orderId: order.id, merchantId: product.merchantId}).then(result => {
    if (result.ok) showToast(`Order ${store.state.orders[0]?.id || "sent"} sent`);
    else { store.state.cart = cartBefore; store.save(); render(); }
  });
}

function renderMerchant() {
  const merchant = store.merchant(store.state.merchantId);
  if (!merchant) { app.innerHTML = `<div class="empty">No merchant selected.</div>`; return; }
  const experience = merchantExperience(store.state, merchant.id);
  const orders = store.state.orders.filter(o => o.merchantId === merchant.id);
  const active = orders.filter(o => ["new","accepted","ready"].includes(o.status));
  const queueStatuses = ["new", "accepted", "ready"].sort((a, b) => Number(active.some(o => o.status === b)) - Number(active.some(o => o.status === a)));
  const tab = store.state.merchantTab || "orders";
  const paymentAccount = payfastAccount(merchant);
  const paymentLabel = {not_started:"Start here",submitted:"Under review",needs_action:"Needs an update",details_checked:"Details reviewed"}[paymentAccount.status] || "Start here";
  const paymentTone = paymentAccount.status === "details_checked" ? "green" : paymentAccount.status === "needs_action" ? "red" : "amber";
  const tabs = [["orders","Orders"],["menu","Menu"],["store","Store"],["support","Support"]];
  const merchantMetrics = `<div class="metric-grid merchant-metrics"><div class="metric"><div class="value">${merchant.online && merchant.listingStatus === "active" ? "Open" : "Closed"}</div><div class="label">Accepting orders</div></div><div class="metric"><div class="value">${active.length}</div><div class="label">Active pickup orders</div></div><div class="metric"><div class="value experience-value"><span class="experience-dot ${experience.tone}"></span>${experience.count >= 3 ? experience.label : "New"}</div><div class="label">Pickup experience · ${experience.count} rated</div></div><div class="metric"><div class="value">${merchant.menu.filter(i => i.available).length}/${merchant.menu.length}</div><div class="label">Items available</div></div></div>`;
  const pastOrders = orders.filter(o => ["completed", "cancelled"].includes(o.status));
  const orderScreen = `<div class="section-head"><div><h2>Pickup queue</h2><p>Accept, prepare and hand over each order.</p></div><div class="action-row">${pastOrders.length ? `<a class="btn ghost small" href="#merchantOrderHistory">Past orders · ${pastOrders.length} ↓</a>` : ""}<button class="btn ${merchant.online ? "ghost" : "primary"}" id="toggleOnline" ${merchant.listingStatus !== "active" ? "disabled" : ""}>${merchant.online ? "Close for orders" : "Open for orders"}</button></div></div>
    <div class="queue-grid">${queueStatuses.map(status => `<div class="queue-column"><h3>${status === "new" ? "New" : status === "accepted" ? "Preparing" : "Ready"} · ${active.filter(o => o.status === status).length}</h3>${active.filter(o => o.status === status).map(merchantOrderCard).join("") || `<div class="empty">Nothing here.</div>`}</div>`).join("")}</div>
    ${merchantMetrics}<section class="panel section" id="merchantOrderHistory"><h2>Order history</h2><p class="muted">Open a previous order to review its items, contact details and refund requests.</p>${pastOrders.map(merchantHistoryRow).join("") || `<div class="empty">Completed and cancelled orders appear here.</div>`}</section>`;
  const menuScreen = `<section class="panel"><div class="section-head"><div><h2>Your menu</h2><p>Edit products, paid extras and free removals.</p></div><button class="btn primary small" id="addMenuItem">+ Add item</button></div>
    ${merchant.menu.map(item => `<div class="list-row"><div class="menu-summary"><div class="menu-thumb" aria-hidden="true">${esc(item.emoji || "🥪")}</div><div><strong>${esc(item.name)}</strong><p>${money(item.price)} · ${choicesFor(item).length} choices</p></div></div><div class="list-row-actions"><button class="btn ghost small" data-edit-item="${item.id}">Edit</button><button class="btn ${item.available ? "ghost" : "dark"} small" data-toggle-item="${item.id}">${item.available ? "Available" : "Unavailable"}</button></div></div>`).join("") || `<div class="empty">Add your first product to prepare the listing.</div>`}</section>`;
  const storeScreen = `<div class="detail-layout"><section class="panel"><form id="merchantStoreForm" class="editor-form compact-form"><section class="merchant-editor-section"><h2>Merchant details</h2><label>Trading name<input name="name" required value="${esc(merchant.name)}"></label><div class="editor-pair"><label>Area<input name="area" required value="${esc(merchant.area)}"></label><label>Prep time (min)<input name="prepMinutes" type="number" min="1" max="180" required value="${merchant.prepMinutes}"></label></div><div class="editor-pair"><label>Contact name<input name="contactName" value="${esc(merchant.contact?.name)}"></label><label>Phone<input name="phone" type="tel" value="${esc(merchant.contact?.phone)}"></label></div><label>Email<input name="email" type="email" value="${esc(merchant.contact?.email)}"></label></section>
    <section class="merchant-editor-section pickup-section"><div class="merchant-section-title"><h2>Pickup location</h2><a class="text-link" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer" data-directions="${merchant.id}">Open Maps ↗</a></div><label>Pickup address<input name="address" required value="${esc(merchant.address)}" autocomplete="street-address"></label></section><button class="btn primary" type="submit">Save changes</button></form></section>
    <section class="panel payfast-onboarding"><div class="merchant-section-title"><div><div class="eyebrow">Get paid online</div><h2>Your PayFast account</h2></div><span class="badge ${paymentTone}">${paymentLabel}</span></div>
      <p>You will need your own PayFast account for the planned online payment split. We can help you get it ready while your kota spot is being set up.</p>
      <ol class="payment-steps"><li><strong>Choose your account.</strong> Individual is for a trader or sole proprietor; Business is for a registered business.</li><li><strong>Sign up and verify with PayFast.</strong> Give your identity and bank details to PayFast on its own site.</li><li><strong>Send us your Merchant ID.</strong> Find it in your PayFast dashboard under Account → Personal Information after verification.</li></ol>
      <div class="action-row"><a class="btn primary" href="${PAYFAST_SIGNUP_URL}" target="_blank" rel="noopener noreferrer">Create a PayFast account ↗</a><a class="text-link" href="${PAYFAST_DASHBOARD_URL}" target="_blank" rel="noopener noreferrer">I already have one ↗</a></div>
      ${paymentAccount.reviewNote ? `<p class="payment-review-note">GoodKota: ${esc(paymentAccount.reviewNote)}</p>` : ""}
      <form id="payfastAccountForm" class="editor-form"><div class="editor-pair"><label>Account type<select name="accountType" required><option value="">Choose one</option><option value="individual" ${paymentAccount.accountType === "individual" ? "selected" : ""}>Individual trader</option><option value="business" ${paymentAccount.accountType === "business" ? "selected" : ""}>Registered business</option></select></label><label>PayFast Merchant ID<input name="merchantId" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="off" required placeholder="8 digits" value="${esc(paymentAccount.merchantId)}"></label></div><button class="btn ghost" type="submit">${paymentAccount.merchantId ? "Update account details" : "Send account details"}</button></form>
      <p class="muted">Send only your Merchant ID. GoodKota does not ask for your PayFast password, bank details or identity documents here. Online payment remains off until the payment integration is verified.</p></section>
    <section class="panel"><h2>Listing and quality</h2><p>${merchant.listingStatus === "active" ? "Your spot is listed." : "Your listing is awaiting GoodKota approval."} ${merchant.online ? "Customers can order now." : "Orders are currently closed."}</p><div class="action-row"><span class="badge ${merchant.listingStatus === "active" ? "green" : "amber"}">${esc(merchant.listingStatus)}</span><span class="badge ${merchant.quality?.status === "intervention" ? "red" : merchant.quality?.status === "watch" ? "amber" : "green"}">Quality: ${esc(merchant.quality?.status || "healthy")}</span></div><p class="muted">${esc(merchant.statusReason || "")}</p><p class="muted">${esc(merchant.quality?.note || "")}</p><p class="muted">Collected-order feedback: ${experience.counts.amazing} amazing · ${experience.counts.good} good · ${experience.counts.average} average</p><div class="standard-list">${STANDARD.map(item => `<div class="standard-row"><span>${merchant.standard?.[item.id] ? "✓" : "•"}</span><span>${esc(item.name)}</span></div>`).join("")}</div><p class="muted">${esc(merchant.reviewNote || "")}</p></section></div>`;
  const supportScreen = `<div class="detail-layout"><section class="panel"><h2>Contact GoodKota</h2><form class="editor-form" id="merchantCaseForm"><label>Subject<input name="subject" required maxlength="80" placeholder="What do you need help with?"></label><label>Message<textarea name="message" required rows="5" maxlength="1000" placeholder="Give us the details"></textarea></label><button class="btn primary" type="submit">Send support request</button></form></section><section class="panel"><h2>Your cases</h2>${store.state.supportCases.filter(c => c.merchantId === merchant.id).map(c => `<div class="work-row"><div><strong>${esc(c.subject)}</strong><p>${esc(c.message)}</p>${c.note ? `<p class="muted">GoodKota: ${esc(c.note)}</p>` : ""}</div><span class="badge ${c.status === "resolved" ? "green" : "amber"}">${esc(c.status.replaceAll("_", " "))}</span></div>`).join("") || `<div class="empty">No support cases yet.</div>`}</section></div>`;
  app.innerHTML = `<div class="work-topline"><div class="page-title compact"><div class="eyebrow">Merchant workspace</div><h1>${esc(merchant.name)}</h1><p>Pickup orders and your storefront in one place.</p></div></div>
    <nav class="work-tabs" aria-label="Merchant sections">${tabs.map(([id,label]) => `<button class="${tab === id ? "active" : ""}" data-merchant-tab="${id}">${label}</button>`).join("")}</nav>
    ${tab === "orders" ? orderScreen : `${merchantMetrics}${tab === "menu" ? menuScreen : tab === "store" ? storeScreen : supportScreen}`}`;

  app.querySelector("#merchantSwitch")?.addEventListener("change", event => { store.state.merchantId = event.target.value; store.save(); render(); });
  app.querySelectorAll("[data-merchant-tab]").forEach(button => button.addEventListener("click", () => { store.state.merchantTab = button.dataset.merchantTab; store.save(); render(); }));
  app.querySelector("#addMenuItem")?.addEventListener("click", () => openMenuEditor(merchant));
  app.querySelectorAll("[data-edit-item]").forEach(button => button.addEventListener("click", () => openMenuEditor(merchant, merchant.menu.find(item => item.id === button.dataset.editItem))));
  app.querySelector("#toggleOnline")?.addEventListener("click", () => {
    if (merchant.listingStatus !== "active") return;
    merchant.online = !merchant.online;
    store.log("merchant_availability_changed", { merchantId: merchant.id, online: merchant.online });
    render();
  });
  app.querySelector("#merchantStoreForm")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try { saveMerchant(store, merchant.id, Object.fromEntries(new FormData(event.currentTarget))); showToast("Store details saved"); render(); }
    catch (error) { showToast(error.message); }
  });
  app.querySelector("#payfastAccountForm")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try { submitPayfastAccount(store, merchant.id, Object.fromEntries(new FormData(event.currentTarget))); showToast("Account details sent for review"); render(); }
    catch (error) { showToast(error.message); }
  });
  const storeForm = app.querySelector("#merchantStoreForm");
  storeForm?.querySelectorAll('[name="address"], [name="area"]').forEach(input => input.addEventListener("input", () => {
    storeForm.querySelector("[data-directions]").href = directionsUrl({address: storeForm.elements.address.value.trim(), area: storeForm.elements.area.value.trim()});
  }));
  app.querySelector("#merchantCaseForm")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try { const fields = Object.fromEntries(new FormData(event.currentTarget)); createCase(store, merchant.id, fields.subject, fields.message); showToast("Support request sent"); render(); }
    catch (error) { showToast(error.message); }
  });
  app.querySelectorAll("[data-order-next]").forEach(button => button.addEventListener("click", () => {
    const order = store.state.orders.find(o => o.id === button.dataset.orderNext);
    if (!order) return;
    const next = {new:"accepted",accepted:"ready",ready:"completed"}[order.status];
    try { transitionOrder(store, order.id, next); render(); } catch (error) { showToast(error.message); }
  }));
  app.querySelectorAll("[data-order-cancel]").forEach(button => button.addEventListener("click", () => openCancelOrder(button.dataset.orderCancel)));
  app.querySelectorAll("[data-order-history]").forEach(button => button.addEventListener("click", () => openMerchantOrder(button.dataset.orderHistory)));
  app.querySelectorAll("[data-toggle-item]").forEach(button => button.addEventListener("click", () => {
    const item = merchant.menu.find(i => i.id === button.dataset.toggleItem);
    item.available = !item.available;
    store.log("merchant_item_availability_changed", {merchantId: merchant.id, productId: item.id, available: item.available});
    render();
  }));
}

function openCancelOrder(orderId) {
  modal.innerHTML = `<form class="modal-body editor-form" id="cancelOrderForm"><div class="modal-head"><div><div class="eyebrow">Pickup order</div><h2>Cancel ${esc(orderId)}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><label>Reason<textarea name="reason" required rows="3" placeholder="Tell the customer why the order cannot be made"></textarea></label><button class="btn dark" type="submit">Cancel order</button></form>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try { transitionOrder(store, orderId, "cancelled", new FormData(event.currentTarget).get("reason")); modal.close(); render(); }
    catch (error) { showToast(error.message); }
  });
}

function merchantHistoryRow(order) {
  const review = order.refundReview;
  return `<div class="list-row history-row"><div class="history-copy"><strong>${esc(order.id)} · ${esc(order.customer || "Customer")}</strong><p>${esc(order.createdAt || order.createdIso || "")}${order.status === "cancelled" ? ` · Cancelled` : " · Collected"}</p></div><div class="list-row-actions"><span class="badge ${order.status === "completed" ? "green" : "red"}">${esc(order.status)}</span>${review ? `<span class="badge ${review.status === "needs_info" ? "amber" : review.status === "resolved" ? "green" : "orange"}">Refund: ${esc(review.status.replaceAll("_", " "))}</span>` : ""}<strong>${money(order.total)}</strong><button class="btn ghost small" type="button" data-order-history="${esc(order.id)}">View details</button></div></div>`;
}

function openMerchantOrder(orderId) {
  const order = store.state.orders.find(item => item.id === orderId && item.merchantId === store.state.merchantId && ["completed", "cancelled"].includes(item.status));
  if (!order) { showToast("Order unavailable"); return; }
  const review = order.refundReview;
  const pickup = order.pickup || store.merchant(order.merchantId);
  modal.innerHTML = `<div class="modal-body editor-form"><div class="modal-head"><div><div class="eyebrow">Previous pickup · ${esc(order.status)}</div><h2>${esc(order.id)}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div>
    <p class="muted">${esc(order.createdAt || order.createdIso || "")} · ${money(order.total)}</p>
    <div class="order-detail-block"><strong>Customer</strong><p>${esc(order.customer || "Customer")} · ${esc(order.contact?.phone || "No phone recorded")}${order.contact?.email ? ` · ${esc(order.contact.email)}` : ""}</p></div>
    <div class="order-detail-block"><strong>Items</strong><div class="order-items">${(order.items || []).map(line => `<div>${line.qty} × ${esc(line.name || store.product(line.productId)?.name || "Item")} · ${money((line.unitPrice || 0) * line.qty)}<small>${esc(choiceText(line))}</small></div>`).join("") || "No item details recorded"}</div></div>
    <div class="order-detail-block"><strong>Collection</strong><p>${esc(pickup?.address || pickup?.area || "Address not recorded")}</p>${pickup ? `<a class="text-link" href="${directionsUrl(pickup)}" target="_blank" rel="noopener noreferrer">Open navigation ↗</a>` : ""}${order.cancelReason ? `<p>Cancellation reason: ${esc(order.cancelReason)}</p>` : ""}${order.experience ? `<p>Pickup experience: ${esc(EXPERIENCE[order.experience.value]?.label || "Rated")}</p>` : ""}</div>
    <div class="order-detail-block"><strong>Payment and refund</strong><p>Pay on collection · payment is not verified in GoodKota.</p>${review ? `<p><span class="badge ${review.status === "resolved" ? "green" : "amber"}">Refund review: ${esc(review.status.replaceAll("_", " "))}</span> · ${money(review.amount)}</p><p>Reason: ${esc(review.reason)}</p>${review.adminNote ? `<p>GoodKota note: ${esc(review.adminNote)}</p>` : ""}${review.status === "resolved" ? `<p>Recorded outcome: ${review.outcome === "handled_externally" ? "Handled outside GoodKota" : "No refund due"}${review.externalReference ? ` · Ref: ${esc(review.externalReference)}` : ""}</p>` : ""}${review.history?.length ? `<details class="refund-timeline"><summary>Review activity</summary><ul>${review.history.map(entry => `<li><strong>${esc(entry.actor)} · ${esc(entry.action.replaceAll("_", " "))}</strong><small>${esc(entry.at)}</small><span>${esc(entry.note)}</span></li>`).join("")}</ul></details>` : ""}` : `<p class="muted">If the customer paid and money may be owed, send a refund review to GoodKota.</p>`}
    ${!review || review.status === "needs_info" ? `<button class="btn primary" type="button" id="requestRefundReview">${review ? "Add information" : "Request refund review"}</button>` : ""}<p class="muted">This review does not move money or change payment status.</p></div></div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("#requestRefundReview")?.addEventListener("click", () => openMerchantRefundForm(order));
}

function openMerchantRefundForm(order) {
  const review = order.refundReview;
  modal.innerHTML = `<form class="modal-body editor-form" id="refundReviewForm"><div class="modal-head"><div><div class="eyebrow">${esc(order.id)} · ${money(order.total)}</div><h2>${review ? "Add refund information" : "Request refund review"}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div>
    ${review?.adminNote ? `<p class="payment-review-note">GoodKota: ${esc(review.adminNote)}</p>` : ""}<p class="muted">Confirm that the customer paid. GoodKota will review the full order amount; this form does not issue a refund.</p>
    <label>How did the customer pay?<select name="paymentMethod" required><option value="">Choose method</option>${[["cash","Cash"],["card","Card at collection"],["eft","EFT"],["other","Other"]].map(([value,label]) => `<option value="${value}" ${review?.paymentMethod === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label>Payment or receipt reference (if available)<input name="paymentReference" maxlength="100" value="${esc(review?.paymentReference || "")}" placeholder="Receipt number or transaction reference"></label>
    <label>Why is a refund needed?<textarea name="reason" required maxlength="500" rows="3" placeholder="Explain what happened and what was paid">${esc(review?.reason || "")}</textarea></label>
    <div class="action-row"><button class="btn ghost" type="button" id="backToOrder">Back to order</button><button class="btn primary" type="submit">Send for review</button></div></form>`;
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("#backToOrder").addEventListener("click", () => openMerchantOrder(order.id));
  modal.querySelector("#refundReviewForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try { requestRefundReview(store, store.state.merchantId, order.id, Object.fromEntries(new FormData(event.currentTarget))); modal.close(); showToast("Refund review sent to GoodKota"); render(); }
    catch (error) { showToast(error.message); }
  });
}

function openMenuEditor(merchant, item) {
  const optionRow = option => `<div class="option-editor-row"><input name="optionName" aria-label="Choice name" placeholder="Cheese, no atchar, hot" maxlength="50" required value="${esc(option?.name || "")}"><select name="optionKind" aria-label="Choice type"><option value="add" ${option?.kind === "add" ? "selected" : ""}>Extra</option><option value="remove" ${option?.kind === "remove" ? "selected" : ""}>Leave out</option><option value="select" ${option?.kind === "select" ? "selected" : ""}>Choose one</option></select><input name="optionGroup" aria-label="Group for choose one" placeholder="Sauce / Heat" maxlength="40" ${option?.kind === "select" ? "required" : "disabled"} value="${esc(option?.group || "")}"><input name="optionPrice" aria-label="Choice price in rand" type="number" min="0" max="999" step="0.01" inputmode="decimal" value="${option?.kind === "remove" ? "0" : ((option?.price || 0) / 100).toFixed(2)}" ${option?.kind === "remove" ? "readonly" : ""} required><label class="option-on" title="Available to customers"><input name="optionAvailable" type="checkbox" ${option?.available === false ? "" : "checked"}>On</label><button class="btn ghost small" type="button" data-remove-option aria-label="Remove choice">×</button></div>`;
  modal.innerHTML = `<form class="modal-body editor-form" id="menuForm"><div class="modal-head"><div><div class="eyebrow">Merchant menu</div><h2>${item ? "Edit item" : "Add item"}</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div><label>Item name<input name="name" required maxlength="80" value="${esc(item?.name || "")}" placeholder="Classic Kota"></label><label>Description<textarea name="desc" required maxlength="220" rows="2" placeholder="What comes with it">${esc(item?.desc || "")}</textarea></label><div class="editor-pair"><label>Price (R)<input name="price" type="number" min="1" max="9999" step="0.01" inputmode="decimal" required value="${item ? (item.price / 100).toFixed(2) : ""}"></label><label>Picture placeholder<select name="emoji"><option value="🥪" ${item?.emoji === "🥪" ? "selected" : ""}>🥪 Kota</option><option value="🍔" ${item?.emoji === "🍔" ? "selected" : ""}>🍔 Loaded</option><option value="🍗" ${item?.emoji === "🍗" ? "selected" : ""}>🍗 Chicken</option></select></label></div><div class="option-editor"><div class="section-head"><div><strong>Customer choices</strong><p class="muted">Extras can cost more, removals are free, and “Choose one” groups sauce or heat preferences.</p></div><button class="btn ghost small" type="button" id="addOption">+ Choice</button></div><div id="optionRows">${choicesFor(item).map(optionRow).join("")}</div></div><label class="inline-check"><input name="available" type="checkbox" ${!item || item.available ? "checked" : ""}> Available to order</label><button class="btn primary wide" type="submit">Save item</button></form>`;
  modal.showModal();
  const form = modal.querySelector("#menuForm");
  form.querySelector("[data-close]").addEventListener("click", () => modal.close());
  form.querySelector("#addOption").addEventListener("click", () => form.querySelector("#optionRows").insertAdjacentHTML("beforeend", optionRow()));
  form.addEventListener("click", event => { if (event.target.closest("[data-remove-option]")) event.target.closest(".option-editor-row").remove(); });
  form.addEventListener("change", event => {
    if (event.target.name !== "optionKind") return;
    const row = event.target.closest(".option-editor-row");
    const group = row.querySelector('[name="optionGroup"]');
    group.disabled = event.target.value !== "select";
    group.required = event.target.value === "select";
    const price = row.querySelector('[name="optionPrice"]');
    price.readOnly = event.target.value === "remove";
    if (price.readOnly) price.value = "0.00";
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = data.get("name").trim();
    const desc = data.get("desc").trim();
    if (!name || !desc) { showToast("Enter a name and description"); return; }
    const rows = [...form.querySelectorAll(".option-editor-row")];
    const names = rows.map(row => { const kind = row.querySelector('[name="optionKind"]').value; return `${kind}:${kind === "select" ? row.querySelector('[name="optionGroup"]').value.trim().toLowerCase() : ""}:${row.querySelector('[name="optionName"]').value.trim().toLowerCase()}`; });
    if (rows.some(row => !row.querySelector('[name="optionName"]').value.trim() || (row.querySelector('[name="optionKind"]').value === "select" && !row.querySelector('[name="optionGroup"]').value.trim())) || new Set(names).size !== names.length) { showToast("Give each choice a unique name and a group where needed"); return; }
    const old = choicesFor(item);
    const groupNames = new Map();
    const choices = rows.map(row => {
      const name = row.querySelector('[name="optionName"]').value.trim();
      const kind = row.querySelector('[name="optionKind"]').value;
      let group = kind === "select" ? row.querySelector('[name="optionGroup"]').value.trim() : "";
      if (group) { const key = group.toLowerCase(); group = groupNames.get(key) || group; groupNames.set(key, group); }
      const price = kind === "remove" ? 0 : Math.round(Number(row.querySelector('[name="optionPrice"]').value) * 100);
      const existing = old.find(choice => choice.name.toLowerCase() === name.toLowerCase() && choice.kind === kind && (choice.group || "").toLowerCase() === group.toLowerCase());
      return {id: existing?.id || `c-${crypto.randomUUID()}`, name, kind, group, price, available: row.querySelector('[name="optionAvailable"]').checked};
    });
    const saved = {id: item?.id || `p-${crypto.randomUUID()}`, name, desc, price: Math.round(Number(data.get("price")) * 100), emoji: data.get("emoji"), available: data.has("available"), choices};
    if (item) Object.assign(item, saved); else merchant.menu.push(saved);
    store.log("merchant_menu_saved", {merchantId: merchant.id, productId: saved.id});
    modal.close(); showToast(item ? "Item updated" : "Item added"); render();
  });
}

function merchantOrderCard(order) {
  const labels = { new: "Accept", accepted: "Mark ready", ready: "Collected" };
  return `<article class="order-card"><h4>${esc(order.id)}</h4><p>${esc(order.customer)} · ${esc(order.contact?.phone || "No phone")} · ${order.items.reduce((n,i) => n + i.qty, 0)} item(s)</p><p>${esc(order.createdAt)} · Pay on collection</p><div class="order-items">${order.items.map(line => `<div>${line.qty} × ${esc(line.name || store.product(line.productId)?.name || "Item")} <small>${esc(choiceText(line))}</small></div>`).join("")}</div><div class="order-footer"><strong>${money(order.total)}</strong><div class="list-row-actions">${["new","accepted"].includes(order.status) ? `<button class="btn ghost small" data-order-cancel="${order.id}">Cancel</button>` : ""}<button class="btn primary small" data-order-next="${order.id}">${labels[order.status]}</button></div></div></article>`;
}

accountButton.addEventListener("click", () => {
  if (!actor) { openAccess(); return; }
  modal.innerHTML = `<div class="modal-body editor-form"><div class="modal-head"><div><div class="eyebrow">${esc(actor.role === "admin" ? "GoodKota management" : actor.role === "merchant" ? "Merchant workspace" : "Customer account")}</div><h2>Your account</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p>${esc(actor.email)}</p>${!actor.emailVerified ? `<p class="muted">Email verification is waiting. Check your inbox or request a fresh link.</p><button class="btn ghost" type="button" id="resendEmail">Resend verification</button>` : ""}<button class="btn ghost" type="button" id="signOut">Sign out</button></div>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("#resendEmail")?.addEventListener("click", resendEmail);
  modal.querySelector("#signOut").addEventListener("click", async () => {
    try {
      const response = await fetch("./api/auth/logout", {method:"POST",credentials:"same-origin"});
      if (!response.ok) throw new Error("Sign-out failed");
      modal.close(); actor = null; store = null; await boot();
    } catch { showToast("Could not sign out. Try again."); }
  });
});

locationButton.addEventListener("click", () => {
  modal.innerHTML = `<form class="modal-body editor-form" id="areaForm"><div class="modal-head"><div><div class="eyebrow">Explore nearby</div><h2>Choose your area</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p class="muted">We show kota spots in your area first. You can still explore every listed spot.</p><div class="area-picks">${store.state.locations.map(area => `<button type="button" class="chip ${store.state.location === area ? "active" : ""}" data-area="${esc(area)}">${esc(area)}</button>`).join("")}</div><label>Or enter your area<input name="area" maxlength="80" required value="${esc(store.state.location)}" placeholder="e.g. Ebony Park"></label><button class="btn primary" type="submit">Explore this area</button></form>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  const form = modal.querySelector("form");
  form.querySelectorAll("[data-area]").forEach(button => button.addEventListener("click", () => { form.querySelector('[name="area"]').value = button.dataset.area; form.requestSubmit(); }));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const area = new FormData(form).get("area").trim();
    if (!area) return;
    store.state.location = area;
    store.save();
    modal.close(); render();
  });
});

document.querySelector("#brandHome").addEventListener("click", () => {
  if (!store || store.state.role !== "customer") return;
  store.state.selectedMerchantId = null;
  store.state.customerTab = "discover";
  store.save();
  render();
});

app.addEventListener("click", event => {
  if (event.target.id === "backDiscover") {
    store.state.selectedMerchantId = null;
    store.save();
    render();
  }
});

modal.addEventListener("click", event => {
  if (event.target === modal) modal.close();
});

async function boot() {
  clearInterval(refreshTimer);
  let resumeCart = false;
  let verificationNotice = "";
  const verificationToken = typeof location !== "undefined" ? new URL(location.href).searchParams.get("verify") : null;
  if (verificationToken) {
    history.replaceState(null,"",location.pathname + location.hash);
    try {
      const response = await fetch("./api/auth/verify-email", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({token:verificationToken})});
      const result = await response.json();
      verificationNotice = response.ok ? "Email verified. You can continue." : result.error || "Verification link has expired.";
    } catch { verificationNotice = "Could not verify the link. Try again later."; }
  }
  try {
    const guestCart = store && !store.actor ? store.state.cart : [];
    const [sessionResponse, dataResponse,capabilitiesResponse] = await Promise.all([fetch("./api/auth/session",{credentials:"same-origin"}),fetch("./api/data",{credentials:"same-origin"}),fetch("./api/auth/capabilities",{credentials:"same-origin"})]);
    if (!sessionResponse.ok || !dataResponse.ok || !capabilitiesResponse.ok) throw new Error("Server unavailable");
    const capabilities = await capabilitiesResponse.json();
    firebaseMode = capabilities.provider === "firebase";
    mailResendAvailable = capabilities.resendAvailable === true;
    orderReadyEmailAvailable = capabilities.orderReadyEmailAvailable === true;
    actor = (await sessionResponse.json()).user;
    store = new Store((await dataResponse.json()).state, actor, error => { if (error) showToast(error); if (error === "Sign in to continue.") boot(); else render(); });
    if (actor?.role === "customer" && guestCart.length) { store.state.cart = guestCart; store.save(); }
    accountButton.hidden = false;
  } catch {
    accountButton.hidden = true;
    app.innerHTML = `<section class="panel connection-state"><div class="eyebrow">GoodKota</div><h1>Connect to GoodKota</h1><p>Accounts and orders need the GoodKota server. Start the app with <code>npm start</code> or visit the server-hosted address.</p></section>`;
    return;
  }
  render();
  if (verificationNotice) showToast(verificationNotice);
  if (resumeCart) { openCart(); showToast("Signed in. Review your cart to place the order."); }
  if (typeof window !== "undefined") refreshTimer = setInterval(refreshSharedState, 12000);
}

async function refreshSharedState() {
  if (!store || modal.open || ["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) return;
  const current = store;
  await current.queue;
  try {
    const response = await fetch("./api/data",{credentials:"same-origin",cache:"no-store"});
    if (!response.ok || current !== store) return;
    const snapshot = (await response.json()).state;
    if (snapshot.accountId !== (actor?.id || null)) { await boot(); showToast("Session ended. Sign in again to continue."); return; }
    if (snapshot.revision === current.state.revision) return;
    const newOrders = actor?.role === "merchant" && snapshot.orders.filter(o => o.status === "new" && !current.state.orders.some(previous => previous.id === o.id)).length;
    const previousNotices = new Set((current.state.notifications || []).map(item => item.id));
    const newNotices = actor?.role === "customer" ? (snapshot.notifications || []).filter(item => !previousNotices.has(item.id)) : [];
    current.sync(snapshot);
    if (newOrders) showToast(`${newOrders} new pickup order${newOrders === 1 ? "" : "s"}`);
    if (newNotices.length) {
      showToast(newNotices[0].message);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then(registration => registration.showNotification("GoodKota", {body:newNotices[0].message,tag:newNotices[0].id,data:{orderId:newNotices[0].orderId}})).catch(() => {});
      }
    }
  } catch { /* Keep the current view when the connection is briefly unavailable. */ }
}

async function saveProfileAfterRegistration(fields) {
  try {
    const response = await fetch("./api/actions",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"customer_details_saved",payload:{fields:{firstName:fields.firstName,lastName:fields.lastName,phone:fields.phone,email:fields.email}}})});
    return response.ok;
  } catch { return false; }
}

function openAccess(mode = "login") {
  const titles = {login:"Welcome back",register:"Create a customer account",claim:"Activate merchant access"};
  const registrationFields = mode === "register" ? `<div class="editor-pair"><label>First name<input name="firstName" autocomplete="given-name" maxlength="80" required></label><label>Last name<input name="lastName" autocomplete="family-name" maxlength="80" required></label></div><label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" required></label>` : "";
  const alternate = mode === "login" ? `<div class="auth-switch"><span>New to GoodKota?</span><button class="btn ghost wide" type="button" data-auth-mode="register">Create an account</button><button class="link-button auth-tertiary" type="button" data-auth-mode="claim">Have a merchant invitation?</button></div>` : mode === "register" ? `<div class="auth-switch"><span>Already have an account?</span><button class="btn ghost wide" type="button" data-auth-mode="login">Sign in instead</button><button class="link-button auth-tertiary" type="button" data-auth-mode="claim">Activate merchant invitation</button></div>` : `<div class="auth-switch"><span>Not activating a merchant account?</span><button class="btn ghost wide" type="button" data-auth-mode="login">Sign in</button><button class="link-button auth-tertiary" type="button" data-auth-mode="register">Create customer account</button></div>`;
  modal.innerHTML = `<form class="modal-body editor-form auth-form" id="accessForm"><div class="modal-head"><div><div class="eyebrow">GoodKota account</div><h2>${titles[mode]}</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div>${registrationFields}<label>Email<input name="email" type="email" autocomplete="email" required></label>${mode === "claim" ? `<label>Merchant invitation code<input name="code" autocomplete="off" required></label>` : ""}<label>Password<input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="12" required></label>${firebaseMode && mode === "login" ? `<button class="link-button auth-forgot" type="button" id="resetPassword">Forgot password?</button>` : ""}<button class="btn primary wide" type="submit">${mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Activate account"}</button>${alternate}<p class="muted" id="authError" role="alert"></p></form>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => openAccess(button.dataset.authMode)));
  modal.querySelector("#resetPassword")?.addEventListener("click", async () => {
    const form = modal.querySelector("#accessForm");
    const email = form.querySelector('[name="email"]');
    if (!email.reportValidity()) return;
    try { firebaseClient ||= await import("./firebase-client.bundle.js"); await firebaseClient.resetPassword(email.value); form.querySelector("#authError").textContent = "If this email has an account, check its inbox for a reset link."; }
    catch { form.querySelector("#authError").textContent = "Could not request a reset link. Try again shortly."; }
  });
  modal.querySelector("#accessForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (firebaseMode) {
        firebaseClient ||= await import("./firebase-client.bundle.js");
        const fields = Object.fromEntries(new FormData(form));
        let mailPending = false;
        if (mode === "register") ({mailPending} = await firebaseClient.register(fields.email,fields.password));
        else if (mode === "claim") {
          try { ({mailPending} = await firebaseClient.register(fields.email,fields.password)); }
          catch (error) { if (error.code === "auth/email-already-in-use") await firebaseClient.signIn(fields.email,fields.password); else throw error; }
        } else {
          const signin = await firebaseClient.signIn(fields.email,fields.password);
          if (signin.next === "mfa_verify") { openFirebaseMfa(); return; }
        }
        const result = await firebaseClient.exchange();
        if (result.next === "mfa_enroll") { await openFirebaseEnrollment(); return; }
        if (result.next === "verify_email") { await firebaseClient.sendCurrentVerification(); throw new Error("Verify your email, then sign in again to set up admin security."); }
        if (result.next === "verify_email" || result.next === "mfa_verify") throw new Error(result.error || "Complete account verification first.");
        if (mode === "claim") {
          const claimResponse = await fetch("./api/auth/claim",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:fields.code})});
          const claim = await claimResponse.json();
          if (!claimResponse.ok) throw new Error(claim.error || "Invitation could not be claimed.");
        }
        const profileSaved = mode !== "register" || await saveProfileAfterRegistration(fields);
        modal.close(); await boot();
        if (!profileSaved) showToast("Account created. Complete your details in Account before ordering.");
        else if (mailPending) showToast("Account created. Verification email could not be sent; retry from your account.");
        return;
      }
      const response = await fetch(`./api/auth/${mode === "register" ? "register" : mode === "claim" ? "claim" : "login"}`, {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      if (result.next) { await openMfa(result.next); return; }
      const profileSaved = mode !== "register" || await saveProfileAfterRegistration(Object.fromEntries(new FormData(form)));
      modal.close(); await boot();
      if (!profileSaved) showToast("Account created. Complete your details in Account before ordering.");
      else if (result.mailPending) showToast("Account created. Email could not be sent; use Resend link.");
    } catch (error) { form.querySelector("#authError").textContent = error.message; submit.disabled = false; }
  });
}

async function openFirebaseEnrollment() {
  const setup = await firebaseClient.startEnrollment();
  modal.innerHTML = `<form class="modal-body editor-form" id="firebaseMfaForm"><div class="modal-head"><div><div class="eyebrow">GoodKota security</div><h2>Set up authenticator</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div><p>Add GoodKota to your authenticator app with this setup key. Then enter the six-digit code.</p><label>Setup key<input readonly value="${esc(setup.key)}"></label><a class="link-button" href="${esc(setup.uri)}">Open in authenticator app</a><label>Security code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button class="btn primary" type="submit">Activate authenticator</button><p class="muted" id="authError" role="alert"></p></form>`;
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try { await firebaseClient.finishEnrollment(new FormData(form).get("code")); modal.close(); openAccess("login"); showToast("Authenticator activated. Sign in again to finish."); }
    catch (error) { form.querySelector("#authError").textContent = error.message || "Check your code and try again."; button.disabled = false; }
  });
}

function openFirebaseMfa() {
  modal.innerHTML = `<form class="modal-body editor-form" id="firebaseMfaForm"><div class="modal-head"><div><div class="eyebrow">GoodKota security</div><h2>Authenticator code</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div><p>Enter the six-digit code from your authenticator app.</p><label>Security code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button class="btn primary" type="submit">Sign in securely</button><p class="muted" id="authError" role="alert"></p></form>`;
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try { const result = await firebaseClient.resolveMfa(new FormData(form).get("code")); if (result.next) throw new Error("Admin access is unavailable. Check MFA setup."); modal.close(); await boot(); }
    catch (error) { form.querySelector("#authError").textContent = error.message || "Check your code and try again."; button.disabled = false; }
  });
}

async function openMfa(next) {
  let setup;
  if (next === "mfa_enroll") {
    const response = await fetch("./api/auth/mfa/setup", {credentials:"same-origin"});
    setup = await response.json();
    if (!response.ok) throw new Error(setup.error || "Authenticator setup unavailable.");
  }
  modal.innerHTML = `<form class="modal-body editor-form" id="mfaForm"><div class="modal-head"><div><div class="eyebrow">GoodKota security</div><h2>${setup ? "Set up authenticator" : "Enter security code"}</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div>${setup ? `<p>Add GoodKota to your authenticator app using this setup key. Then enter its six-digit code.</p><label>Setup key<input value="${esc(setup.secret)}" readonly aria-label="Authenticator setup key"></label><a class="link-button" href="${esc(setup.uri)}">Open in authenticator app</a>` : `<p>Enter the six-digit code from your authenticator, or one of your saved recovery codes.</p>`}<label>Security code<input name="code" autocomplete="one-time-code" inputmode="numeric" required autofocus></label><button class="btn primary" type="submit">${setup ? "Activate and sign in" : "Sign in securely"}</button><p class="muted" id="authError" role="alert"></p></form>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelector("#mfaForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const response = await fetch("./api/auth/mfa/complete", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({code:new FormData(form).get("code")})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Code could not be checked.");
      if (result.backupCodes) {
        modal.innerHTML = `<div class="modal-body editor-form"><div class="eyebrow">Keep these safe</div><h2>Recovery codes</h2><p>Save these one-time codes in a safe place. They are shown only now and can be used if you lose your authenticator.</p><pre class="recovery-codes">${result.backupCodes.join("\n")}</pre><button type="button" class="btn primary" id="finishMfa">I saved my codes</button></div>`;
        modal.querySelector("#finishMfa").addEventListener("click", async () => { modal.close(); await boot(); });
      } else { modal.close(); await boot(); }
    } catch (error) { form.querySelector("#authError").textContent = error.message; button.disabled = false; }
  });
}

app.addEventListener("click", event => { if (event.target.id === "guestSignIn") openAccess(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
boot();
