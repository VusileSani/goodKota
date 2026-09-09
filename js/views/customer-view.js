import { escapeHtml, formatDateTime, money, uid } from "../core/utils.js";
import { calculateOrderPricing } from "../services/pricing-service.js";
import { qualityBadge, isEligibleForProximityRecommendation } from "../services/quality-service.js";
import { deliveryProgress, deliveryStatusLabel } from "../services/delivery-service.js";
import { directionsUrl, navigationProviders, getPreferredNavigationProvider, setPreferredNavigationProvider, clearPreferredNavigationProvider } from "../services/location-service.js";
import { friendlyAuthError } from "../services/auth-error-service.js";

function cartSubtotal(app) {
  return app.cart.reduce((total, line) => {
    const product = app.repos.products.get(line.productId);
    return total + (product?.priceCents || 0) * line.qty;
  }, 0);
}

function cartCount(app) {
  return app.cart.reduce((total, line) => total + line.qty, 0);
}

function cartTotal(app, merchant) {
  const delivery = app.deliveryMode === "Home Delivery" && merchant ? merchant.deliveryFeeCents : 0;
  return cartSubtotal(app) + delivery;
}

function distanceLabel(merchant) {
  if (!Number.isFinite(merchant.distanceKm)) return "Nearby";
  return merchant.distanceKm < 1
    ? `${Math.round(merchant.distanceKm * 1000)} m`
    : `${merchant.distanceKm.toFixed(1)} km`;
}

function locationStrip(app) {
  return `
    <div class="customer-location-strip">
      <div class="customer-location-copy">
        <span class="customer-location-label">Ordering near</span>
        <strong>📍 ${escapeHtml(app.location.label)}</strong>
      </div>
      <button class="btn ghost small" data-change-location>Change</button>
    </div>`;
}

function customerBottomNav(app) {
  const tabs = [
    ["home", "⌂", "Home"],
    ["browse", "▦", "Browse"],
    ["orders", "≡", "Orders"],
    ["cart", "▣", "Cart"],
    ["account", "●", "Account"]
  ];

  return `
    <nav class="customer-bottom-nav" aria-label="Customer navigation">
      ${tabs.map(([section, icon, label]) => `
        <button class="customer-nav-item ${app.customerSection === section ? "active" : ""}" data-customer-section="${section}" aria-current="${app.customerSection === section ? "page" : "false"}">
          <span class="customer-nav-icon" aria-hidden="true">${icon}</span>
          <span>${label}</span>
          ${section === "cart" && cartCount(app) ? `<span class="customer-nav-count">${cartCount(app)}</span>` : ""}
        </button>`).join("")}
    </nav>`;
}

function persistentCartBar(app, merchant) {
  if (!app.cart.length || app.customerSection === "cart") return "";
  return `
    <button class="customer-cart-bar" data-customer-section="cart" aria-label="View cart, ${cartCount(app)} items, ${money(cartTotal(app, merchant))}">
      <span><strong>Your order</strong><small>${cartCount(app)} item${cartCount(app) === 1 ? "" : "s"} · ${money(cartTotal(app, merchant))}</small></span>
      <span class="customer-cart-action">View cart ›</span>
    </button>`;
}

function merchantCard(merchant, index) {
  const badge = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
  const qualityLabel = merchant.qualitySummary.count
    ? `★ ${merchant.qualitySummary.overall.toFixed(1)}`
    : "New";

  return `
    <article class="customer-merchant-card ${merchant.recommendation?.state === "recommended" ? "recommended" : ""}" data-select-merchant="${merchant.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(merchant.name)} menu">
      <div class="customer-merchant-main">
        <div class="customer-merchant-heading">
          <h3>${escapeHtml(merchant.name)}</h3>
          ${merchant.recommendation?.state === "recommended" ? '<span class="badge dark">Yagoya Recommended</span>' : ""}
        </div>
        <div class="customer-merchant-facts">
          <span>${distanceLabel(merchant)}</span>
          <span>${qualityLabel}</span>
          <span>~${merchant.prepMinutes} min</span>
          ${merchant.delivery?.enabled ? '<span>Delivery</span>' : '<span>Takeaway</span>'}
        </div>
        <div class="muted small customer-merchant-address">${escapeHtml(merchant.address)}</div>
        ${badge.tone === "danger" || badge.tone === "warn" ? `<span class="badge ${badge.tone} customer-quality-badge">${badge.label}</span>` : ""}
      </div>
      <span class="customer-card-chevron" aria-hidden="true">›</span>
    </article>`;
}

function productCard(product) {
  const searchable = `${product.name} ${product.desc || ""} ${product.category}`.toLowerCase();
  return `
    <article class="customer-product-card" data-open-product="${product.id}" data-menu-category="${escapeHtml(product.category)}" data-menu-search="${escapeHtml(searchable)}" tabindex="0" role="button" aria-label="View ${escapeHtml(product.name)}">
      <div class="customer-product-copy">
        <span class="muted small">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.desc || "")}</p>
        <strong class="price">${money(product.priceCents)}</strong>
      </div>
      <div class="customer-product-visual" aria-hidden="true">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="" />` : (product.emoji || "🥪")}</div>
      <button class="customer-add-button" data-add-product="${product.id}" aria-label="Add ${escapeHtml(product.name)} to cart">+</button>
    </article>`;
}

function cartLines(app) {
  return app.cart.map(line => {
    const product = app.repos.products.get(line.productId);
    if (!product) return "";
    return `
      <div class="customer-cart-line">
        <div class="customer-cart-line-copy">
          <strong>${escapeHtml(product.name)}</strong>
          <span class="muted small">${money(product.priceCents)} each</span>
        </div>
        <div class="qty" aria-label="Quantity controls for ${escapeHtml(product.name)}">
          <button data-qty="-1" data-product="${product.id}" aria-label="Decrease quantity">−</button>
          <strong>${line.qty}</strong>
          <button data-qty="1" data-product="${product.id}" aria-label="Increase quantity">+</button>
        </div>
        <strong>${money(product.priceCents * line.qty)}</strong>
      </div>`;
  }).join("");
}

function cartSummary(app, merchant, includeCheckout = true) {
  const subtotal = cartSubtotal(app);
  const delivery = app.deliveryMode === "Home Delivery" && merchant ? merchant.deliveryFeeCents : 0;
  return `
    ${app.cart.length ? cartLines(app) : '<div class="empty">Your cart is empty.</div>'}
    ${app.cart.length ? `
      <div class="customer-cart-summary">
        <div class="summary-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <div class="summary-line"><span>Delivery</span><strong>${money(delivery)}</strong></div>
        <div class="summary-line total"><span>Total</span><strong>${money(subtotal + delivery)}</strong></div>
      </div>
      ${includeCheckout ? (app.repos.platform.controls().orderingEnabled ? `<button class="btn primary customer-primary-action" id="checkoutButton">Checkout · ${money(subtotal + delivery)}</button>` : `<div class="notice" style="margin-top:12px">New ordering is temporarily paused.</div>`) : ""}` : ""}`;
}

function recentOrders(app) {
  if (!app.authUser) return '<div class="empty customer-auth-required"><strong>Sign in to view your orders.</strong><span>Your order history is private account information.</span><button class="btn primary" data-auth-mode="signin">Sign in</button></div>';
  const customer = app.repos.users.customer();
  const orders = app.repos.orders.listForCustomer(customer.id, { limit: 10 }).items;
  if (!orders.length) return '<div class="empty">No orders yet.</div>';

  return orders.map(order => {
    const merchant = app.repos.merchants.get(order.merchantId);
    const task = app.repos.delivery.taskForOrder(order.id);
    const canRate = order.status === "completed" && !order.rated;
    const trackable = task && !["cancelled"].includes(task.status);
    return `
      <article class="customer-order-card">
        <div class="customer-order-topline">
          <div><strong>${escapeHtml(merchant?.name || "Yagoya merchant")}</strong><div class="muted small">${escapeHtml(order.orderNumber || order.id)} · ${formatDateTime(order.createdAt)}</div></div>
          <strong>${money(order.amountCents)}</strong>
        </div>
        <div class="customer-order-status">
          <span class="badge ${order.status === "completed" ? "ok" : "info"}">${escapeHtml(order.status)}</span>
          ${task ? `<span class="badge dark">${escapeHtml(deliveryStatusLabel(task.status))}</span>` : ""}
        </div>
        ${(trackable || canRate || order.rated) ? `<div class="row-actions customer-order-actions">
          ${trackable ? `<button class="btn dark small" data-track-order="${order.id}">${task.status === "delivered" ? "Delivery record" : "Track delivery"}</button>` : ""}
          ${canRate ? `<button class="btn primary small" data-rate-order="${order.id}">Rate order</button>` : order.rated ? '<span class="badge ok">✓ Rated</span>' : ""}
        </div>` : ""}
      </article>`;
  }).join("");
}

function renderHome(app, ranked) {
  const customer = app.repos.users.customer();
  const eligible = ranked.filter(isEligibleForProximityRecommendation).length;
  const greetingName = app.authUser?.displayName || customer.name || "";
  return `
    ${locationStrip(app)}
    <section class="customer-screen customer-home-screen">
      <div class="customer-greeting">
        <div class="customer-greeting-copy">
          <span class="eyebrow">Hi ${escapeHtml(app.authUser ? (greetingName.split(" ")[0] || "there") : "there")}</span>
          <h1>Find the good food nearby.</h1>
          <p>Recommended using verified quality, consistency and convenience — not distance alone.</p>
        </div>
        <img class="customer-greeting-mark" src="./assets/yagoya-logo.png" alt="" aria-hidden="true" />
      </div>

      <label class="customer-search" aria-label="Search nearby merchants">
        <span aria-hidden="true">⌕</span>
        <input id="merchantSearch" type="search" placeholder="Search merchants" autocomplete="off" />
      </label>

      <div class="customer-home-meta">
        <strong>${ranked.length} nearby</strong>
        <span class="muted small">${eligible} meeting the Yagoya quality standard</span>
      </div>

      <div class="customer-merchant-list" id="merchantList">
        ${ranked.map((merchant, index) => merchantCard(merchant, index)).join("") || '<div class="empty">No Yagoya food merchants are available near this location yet.</div>'}
      </div>
    </section>`;
}

function renderBrowse(app, selectedMerchant, products) {
  if (!selectedMerchant) {
    return `
      ${locationStrip(app)}
      <section class="customer-screen">
        <div class="empty customer-empty-state">
          <strong>Choose a merchant first.</strong>
          <span>Yagoya will show nearby merchants ranked for quality, consistency and convenience.</span>
          <button class="btn primary" data-customer-section="home">Find a merchant</button>
        </div>
      </section>`;
  }

  const categories = ["All", ...new Set(products.map(product => product.category))];
  const category = categories.includes(app.customerCategory) ? app.customerCategory : "All";
  app.customerCategory = category;

  return `
    ${locationStrip(app)}
    <section class="customer-screen customer-menu-screen">
      <div class="customer-merchant-menu-head">
        <button class="customer-back-link" data-customer-section="home">‹ Merchants</button>
        <div>
          <h1>${escapeHtml(selectedMerchant.name)}</h1>
          <div class="customer-merchant-facts">
            <span>${distanceLabel(selectedMerchant)}</span>
            <span>★ ${selectedMerchant.qualitySummary.overall.toFixed(1)}</span>
            <span>~${selectedMerchant.prepMinutes} min</span>
          </div>
          <div class="customer-store-location">
            <span>${escapeHtml(selectedMerchant.address || selectedMerchant.area || "")}</span>
            <button type="button" class="btn primary small customer-directions-button" data-merchant-directions data-merchant-id="${escapeHtml(selectedMerchant.id)}" aria-label="Choose a navigation app for directions to ${escapeHtml(selectedMerchant.name)}"><span aria-hidden="true">➜</span> Directions</button>
          </div>
        </div>
      </div>

      <div class="customer-fulfilment-toggle" role="group" aria-label="Fulfilment method">
        <button class="${app.deliveryMode === "Takeaway" ? "active" : ""}" data-delivery-mode="Takeaway">Takeaway</button>
        ${selectedMerchant.delivery?.enabled && app.repos.platform.controls().deliveryEnabled ? `<button class="${app.deliveryMode === "Home Delivery" ? "active" : ""}" data-delivery-mode="Home Delivery">Delivery · ${money(selectedMerchant.deliveryFeeCents)}</button>` : ""}
      </div>

      <label class="customer-search customer-menu-search" aria-label="Search menu">
        <span aria-hidden="true">⌕</span>
        <input id="menuSearch" type="search" placeholder="Search this menu" value="${escapeHtml(app.customerMenuQuery)}" autocomplete="off" />
      </label>

      <div class="customer-category-grid" aria-label="Menu categories">
        ${categories.map(item => `<button class="customer-category-chip ${category === item ? "active" : ""}" data-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}
      </div>

      <div class="customer-product-list" id="customerProductList">
        ${products.map(productCard).join("") || '<div class="empty">No menu items are available.</div>'}
      </div>
      <div class="empty customer-filter-empty" id="menuFilterEmpty" hidden>No matching menu items.</div>
    </section>`;
}

function renderOrders(app) {
  return `
    ${locationStrip(app)}
    <section class="customer-screen">
      <div class="customer-screen-title"><h1>Your orders</h1><p>Track active deliveries and review completed orders.</p></div>
      <div class="customer-order-list">${recentOrders(app)}</div>
    </section>`;
}

function renderCart(app, selectedMerchant) {
  return `
    ${locationStrip(app)}
    <section class="customer-screen">
      <div class="customer-screen-title">
        <h1>Your cart</h1>
        <p>${selectedMerchant ? escapeHtml(selectedMerchant.name) : "Choose a merchant to start an order."}</p>
      </div>
      ${selectedMerchant ? `
        <div class="customer-fulfilment-toggle" role="group" aria-label="Fulfilment method">
          <button class="${app.deliveryMode === "Takeaway" ? "active" : ""}" data-delivery-mode="Takeaway">Takeaway</button>
          ${selectedMerchant.delivery?.enabled && app.repos.platform.controls().deliveryEnabled ? `<button class="${app.deliveryMode === "Home Delivery" ? "active" : ""}" data-delivery-mode="Home Delivery">Delivery · ${money(selectedMerchant.deliveryFeeCents)}</button>` : ""}
        </div>
        <div class="card customer-cart-card">${cartSummary(app, selectedMerchant)}</div>
        ${!app.cart.length ? '<button class="btn primary customer-primary-action" data-customer-section="browse">Browse menu</button>' : ""}
      ` : `
        <div class="empty customer-empty-state">
          <strong>No merchant selected.</strong>
          <span>Start with a nearby Yagoya merchant.</span>
          <button class="btn primary" data-customer-section="home">Find a merchant</button>
        </div>`}
    </section>`;
}

function accountRow(id, title, description, meta = "") {
  return `
    <button type="button" class="customer-account-menu-row" data-account-target="${id}">
      <span class="customer-account-menu-copy"><strong>${title}</strong><small>${description}</small></span>
      <span class="customer-account-menu-end">${meta ? `<span class="customer-account-meta">${meta}</span>` : ""}<span class="customer-account-chevron" aria-hidden="true">›</span></span>
    </button>`;
}

function accountPanelHeader(title, description = "") {
  return `
    <div class="customer-account-panel-head">
      <button type="button" class="customer-account-back" data-account-back aria-label="Back to account">‹</button>
      <div><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div>
    </div>`;
}

function renderAccountPanel(app, customer, panel) {
  const authUser = app.authUser;
  const privatePanels = new Set(["orders", "favourites", "addresses", "details", "payments", "preferences"]);
  if (!authUser && privatePanels.has(panel)) {
    return `
      ${accountPanelHeader("Sign in required", "This section belongs to your private Yagoya customer account.")}
      <div class="empty customer-account-empty customer-auth-required"><strong>Sign in to continue.</strong><span>Browsing stays open. Saved orders, addresses, details, payments and preferences require your authenticated account.</span><button class="btn primary" data-auth-mode="signin">Sign in</button><button class="btn ghost" data-auth-mode="register">Create account</button></div>`;
  }

  const orders = authUser ? app.repos.orders.listForCustomer(customer.id, { limit: 5 }).items : [];
  const preferenceOn = Boolean(customer.notificationPreferences?.nearbyQualityMerchants);

  if (panel === "orders") {
    return `
      ${accountPanelHeader("My Orders", "Recent Yagoya orders and their current status.")}
      <div class="customer-account-detail-list">
        ${orders.length ? orders.map(order => {
          const merchant = app.repos.merchants.get(order.merchantId);
          return `<div class="customer-account-detail-row"><span><strong>${escapeHtml(merchant?.name || "Yagoya order")}</strong><small>${escapeHtml(order.orderNumber || order.id)} · ${formatDateTime(order.createdAt)}</small></span><span class="badge">${escapeHtml(order.status)}</span></div>`;
        }).join("") : '<div class="empty customer-account-empty"><strong>No orders yet.</strong><span>Your completed and active orders will appear here.</span></div>'}
      </div>
      <button class="btn ghost customer-primary-action" data-customer-section="orders">Open full order history</button>`;
  }

  if (panel === "favourites") {
    return `
      ${accountPanelHeader("My Favourites", "Keep good local food easy to find again.")}
      <div class="empty customer-account-empty"><strong>No favourites saved yet.</strong><span>Favourite merchants will appear here without crowding the main Account screen.</span></div>
      <button class="btn primary customer-primary-action" data-customer-section="home">Find good food</button>`;
  }

  if (panel === "addresses") {
    return `
      ${accountPanelHeader("My Addresses", "Saved delivery and discovery locations.")}
      <div class="customer-account-detail-list">
        <div class="customer-account-detail-row"><span><strong>Current location</strong><small>${escapeHtml(app.location.label)}</small></span><button class="btn ghost small" data-change-location>Change</button></div>
        <div class="customer-account-detail-row subdued"><span><strong>Home</strong><small>Add a saved Home address when needed.</small></span><span class="customer-account-chevron">›</span></div>
        <div class="customer-account-detail-row subdued"><span><strong>Work</strong><small>Add a saved Work address when needed.</small></span><span class="customer-account-chevron">›</span></div>
      </div>`;
  }

  if (panel === "details") {
    const name = authUser?.displayName || customer.name || "";
    const email = authUser?.email || customer.email || "";
    return `
      ${accountPanelHeader("My Details", "Your basic Yagoya customer information.")}
      <div class="card customer-account-card">
        <div class="customer-account-row"><span>Name</span><strong>${escapeHtml(name || "Not set")}</strong></div>
        <div class="customer-account-row"><span>Phone</span><strong>${escapeHtml(customer.phone || "Not set")}</strong></div>
        <div class="customer-account-row"><span>Email</span><strong>${escapeHtml(email || "Not set")}</strong></div>
      </div>
      <p class="muted small customer-account-note">Profile editing will remain a focused action here rather than exposing permanent form fields on the Account landing screen.</p>`;
  }

  if (panel === "payments") {
    return `
      ${accountPanelHeader("Payments", "Payment preferences and transaction-related settings.")}
      <div class="empty customer-account-empty"><strong>No saved payment method.</strong><span>Yagoya will only expose saved-payment controls when the payment provider supports them securely.</span></div>`;
  }

  if (panel === "preferences") {
    return `
      ${accountPanelHeader("Preferences", "Control optional Yagoya customer features.")}
      <div class="card customer-account-card customer-preference-card">
        <div><strong>Good food alerts</strong><p class="muted small">Nearby recommendations are limited to merchants meeting the Yagoya quality standard.</p></div>
        <button class="btn ${preferenceOn ? "dark" : "primary"}" id="notificationButton">${preferenceOn ? "Turn off" : "Enable alerts"}</button>
      </div>`;
  }

  if (panel === "support") {
    return `
      ${accountPanelHeader("Help & Support", "Get help without filling the Account screen with support controls.")}
      <div class="card customer-account-card action-card"><div><strong>Yagoya support</strong><p class="muted small">Send an issue or question to the Yagoya support team.</p></div><button class="btn primary" id="customerSupportButton">Get help</button></div>`;
  }

  if (panel === "security") {
    if (authUser) {
      return `
        ${accountPanelHeader("Account & Security", "Authentication and access to your Yagoya customer account.")}
        <div class="card customer-account-card">
          <div class="customer-account-row"><span>Status</span><strong>Signed in</strong></div>
          <div class="customer-account-row"><span>Name</span><strong>${escapeHtml(authUser.displayName || "Yagoya customer")}</strong></div>
          <div class="customer-account-row"><span>Email</span><strong>${escapeHtml(authUser.email || "Authenticated account")}</strong></div>
          <div class="customer-account-row"><span>Email verified</span><strong>${authUser.emailVerified ? "Yes" : "Not yet"}</strong></div>
        </div>
        <button type="button" class="btn ghost customer-primary-action" data-account-logout>Log Out</button>`;
    }

    const register = app.customerAuthMode === "register";
    return `
      ${accountPanelHeader("Account & Security", "Sign in or create your Yagoya customer account.")}
      <div class="customer-auth-inline card">
        <div class="customer-auth-inline-head">
          <span class="eyebrow">Yagoya account</span>
          <h3>${register ? "Create account" : "Sign in"}</h3>
          <p class="muted small">${register ? "Create your customer account with email and password." : "Use your Yagoya email and password."}</p>
        </div>
        <form id="customerAuthForm" class="customer-auth-inline-form">
          ${register ? '<label>Name<input name="name" autocomplete="name" required /></label>' : ''}
          <label>Email<input name="email" type="email" autocomplete="email" required /></label>
          <label>Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="6" required /></label>
          <div class="auth-error" id="customerAuthError" role="alert">${escapeHtml(app.customerAuthError || "")}</div>
          <button class="btn primary" type="submit">${register ? "Create account" : "Sign in"}</button>
          <button class="btn ghost" type="button" data-inline-auth-switch="${register ? "signin" : "register"}">${register ? "I already have an account" : "Create customer account"}</button>
        </form>
      </div>`;
  }

  return "";
}

function renderAccount(app) {
  const customer = app.repos.users.customer();
  const panel = app.customerAccountPanel || null;
  const authLabel = !app.authResolved ? "Checking" : app.authUser ? "Signed in" : "Sign in";
  const orderCount = app.authUser ? app.repos.orders.listForCustomer(customer.id, { limit: 100 }).items.length : 0;
  const accountName = app.authUser?.displayName || (app.authResolved ? "Not signed in" : "Checking session…");
  const accountDetail = app.authUser?.email || (app.authResolved ? "Sign in to access saved account information." : "Restoring your Yagoya session.");

  return `
    ${locationStrip(app)}
    <section class="customer-screen customer-account-screen">
      <div class="customer-screen-title"><h1>Account</h1><p>Everything about your Yagoya account, kept compact.</p></div>
      ${panel ? `<div class="customer-account-panel">${renderAccountPanel(app, customer, panel)}</div>` : `
        <div class="customer-account-summary ${app.authUser ? "is-authenticated" : ""}">
          <div><span class="eyebrow">Yagoya account</span><strong>${escapeHtml(accountName)}</strong><small>${escapeHtml(accountDetail)}</small></div>
          <span class="customer-auth-state">${authLabel}</span>
        </div>
        <div class="customer-account-menu" aria-label="Account settings">
          ${accountRow("orders", "My Orders", "Track and review your Yagoya orders.", orderCount ? String(orderCount) : "")}
          ${accountRow("favourites", "My Favourites", "Keep your favourite food spots close.")}
          ${accountRow("addresses", "My Addresses", "Delivery locations and location shortcuts.")}
          ${accountRow("details", "My Details", "Name, phone and contact information.")}
          ${accountRow("payments", "Payments", "Payment preferences and saved methods.")}
          ${accountRow("preferences", "Preferences", "Alerts and customer experience settings.")}
          ${accountRow("support", "Help & Support", "Questions, issues and Yagoya support.")}
          ${accountRow("security", "Account & Security", "Sign-in and account access.", authLabel)}
        </div>
        ${app.authUser ? '<button type="button" class="customer-account-logout" data-account-logout>Log Out</button>' : ""}
      `}
    </section>`;
}

export function renderCustomerView(app) {
  const ranked = app.getRankedMerchants();
  if (app.selectedMerchantId && !ranked.some(merchant => merchant.id === app.selectedMerchantId)) {
    app.selectedMerchantId = null;
    app.cart = [];
  }

  const selectedMerchant = app.selectedMerchantId ? app.repos.merchants.get(app.selectedMerchantId) : null;
  if (selectedMerchant && (!selectedMerchant.delivery?.enabled || !app.repos.platform.controls().deliveryEnabled) && app.deliveryMode === "Home Delivery") app.deliveryMode = "Takeaway";
  const products = selectedMerchant ? app.repos.products.listForMerchant(selectedMerchant.id, { limit: 100, enabled: true }).items : [];

  let screen;
  if (app.customerSection === "browse") screen = renderBrowse(app, selectedMerchant, products);
  else if (app.customerSection === "orders") screen = renderOrders(app);
  else if (app.customerSection === "cart") screen = renderCart(app, selectedMerchant);
  else if (app.customerSection === "account") screen = renderAccount(app);
  else screen = renderHome(app, ranked);

  app.root.innerHTML = `
    <div class="customer-app">
      ${screen}
      ${persistentCartBar(app, selectedMerchant)}
      ${customerBottomNav(app)}
    </div>`;

  bindCustomerEvents(app);
  if (app.customerSection === "browse") applyMenuFilter(app);
}

function bindCustomerEvents(app) {
  app.root.querySelectorAll("[data-customer-section]").forEach(button => {
    button.addEventListener("click", () => app.navigateCustomerSection(button.dataset.customerSection));
  });

  app.root.querySelectorAll("[data-change-location]").forEach(button => {
    button.addEventListener("click", () => openLocationDialog(app));
  });

  app.root.querySelectorAll("[data-merchant-directions]").forEach(button => {
    button.addEventListener("click", () => {
      const merchantId = button.dataset.merchantId || app.selectedMerchantId;
      const merchant = merchantId ? app.repos.merchants.get(merchantId) : null;
      if (merchant) openNavigationChooser(app, merchant);
    });
  });

  app.root.querySelectorAll("[data-select-merchant]").forEach(card => {
    const open = () => app.selectMerchant(card.dataset.selectMerchant);
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });

  const merchantSearch = app.root.querySelector("#merchantSearch");
  merchantSearch?.addEventListener("input", event => {
    const query = event.currentTarget.value.trim().toLowerCase();
    app.root.querySelectorAll("[data-select-merchant]").forEach(card => {
      card.hidden = query && !card.textContent.toLowerCase().includes(query);
    });
  });

  app.root.querySelectorAll("[data-delivery-mode]").forEach(button => {
    button.addEventListener("click", () => {
      app.deliveryMode = button.dataset.deliveryMode;
      app.render();
    });
  });

  const menuSearch = app.root.querySelector("#menuSearch");
  menuSearch?.addEventListener("input", event => {
    app.customerMenuQuery = event.currentTarget.value;
    applyMenuFilter(app);
  });

  app.root.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
      app.customerCategory = button.dataset.category;
      app.root.querySelectorAll("[data-category]").forEach(item => item.classList.toggle("active", item.dataset.category === app.customerCategory));
      applyMenuFilter(app);
    });
  });

  app.root.querySelectorAll("[data-open-product]").forEach(card => {
    card.addEventListener("click", event => {
      if (event.target.closest("[data-add-product]")) return;
      openProduct(app, card.dataset.openProduct);
    });
    card.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest("[data-add-product]")) {
        event.preventDefault();
        openProduct(app, card.dataset.openProduct);
      }
    });
  });

  app.root.querySelectorAll("[data-add-product]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      app.addToCart(button.dataset.addProduct);
    });
  });

  app.root.querySelectorAll("[data-qty]").forEach(button => {
    button.addEventListener("click", () => app.changeQuantity(button.dataset.product, Number(button.dataset.qty)));
  });

  app.root.querySelector("#checkoutButton")?.addEventListener("click", () => openCheckout(app));
  app.root.querySelector("#notificationButton")?.addEventListener("click", () => app.enableNearbyNotifications());
  app.root.querySelector("#customerSupportButton")?.addEventListener("click", () => openCustomerSupport(app));
  app.root.querySelectorAll("[data-account-target]").forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.accountTarget;
    const privatePanels = new Set(["orders", "favourites", "addresses", "details", "payments", "preferences"]);
    if (!app.authUser && privatePanels.has(target)) {
      app.pendingCustomerAction = `account:${target}`;
      app.customerAccountPanel = "security";
      app.customerAuthMode = "signin";
      app.customerAuthError = "";
      app.customerAuthPrompt = `Sign in or create an account to open ${button.querySelector("strong")?.textContent || "this section"}.`;
    } else {
      app.customerAccountPanel = target;
      app.customerAuthPrompt = "";
    }
    app.render();
    window.scrollTo(0, 0);
  }));
  app.root.querySelector("[data-account-back]")?.addEventListener("click", () => { app.customerAccountPanel = null; app.render(); window.scrollTo(0, 0); });
  app.root.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => {
    app.customerSection = "account";
    app.customerAccountPanel = "security";
    app.customerAuthMode = button.dataset.authMode || "signin";
    app.customerAuthError = "";
    if (!app.customerAuthPrompt) app.customerAuthPrompt = "Sign in to access your private Yagoya account information.";
    app.render();
    window.scrollTo(0, 0);
  }));
  app.root.querySelectorAll("[data-inline-auth-switch]").forEach(button => button.addEventListener("click", () => {
    app.customerAuthMode = button.dataset.inlineAuthSwitch || "signin";
    app.customerAuthError = "";
    app.render();
  }));
  app.root.querySelector("#customerAuthForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    app.customerAuthError = "";
    try {
      const registering = app.customerAuthMode === "register";
      if (registering) await app.auth.registerCustomer(form.get("name"), form.get("email"), form.get("password"));
      else await app.auth.signIn(form.get("email"), form.get("password"));
      app.customerAuthMode = "account";
      app.customerAuthPrompt = "";
      app.toast(registering ? "Your customer account is ready to use." : "You can continue with your Yagoya session.", { title: registering ? "Yagoya account created" : "Signed in to Yagoya" });
      app.render();
    } catch (error) {
      app.customerAuthError = friendlyAuthError(error);
      app.render();
    }
  });
  app.root.querySelector("[data-account-logout]")?.addEventListener("click", async () => {
    await app.auth.signOut();
    app.pendingCustomerAction = null;
    app.customerAccountPanel = null;
    app.customerAuthMode = "signin";
    app.customerAuthError = "";
    app.customerAuthPrompt = "";
    app.toast("Your authenticated session has ended.", { title: "Signed out of Yagoya" });
    app.render();
  });
  app.root.querySelectorAll("[data-rate-order]").forEach(button => button.addEventListener("click", () => openRating(app, button.dataset.rateOrder)));
  app.root.querySelectorAll("[data-track-order]").forEach(button => button.addEventListener("click", () => openTracking(app, button.dataset.trackOrder)));
}

function openNavigationChooser(app, merchant) {
  const providers = navigationProviders();
  const preferred = getPreferredNavigationProvider();
  const destination = {
    lat: merchant.latitude,
    lng: merchant.longitude
  };

  app.openDialog(`
    <div class="dialog-inner customer-navigation-dialog">
      <div class="dialog-head">
        <div>
          <span class="eyebrow">Navigation</span>
          <h2>Open directions with</h2>
        </div>
        <button class="icon-btn" data-close-dialog aria-label="Close navigation choices">✕</button>
      </div>

      <div class="navigation-destination">
        <strong>${escapeHtml(merchant.name)}</strong>
        <span>${escapeHtml(merchant.address || merchant.area || "Merchant location")}</span>
      </div>

      <div class="navigation-provider-list" role="list" aria-label="Navigation applications">
        ${providers.map(provider => `
          <button type="button" class="navigation-provider ${preferred === provider.id ? "preferred" : ""}" data-navigation-provider="${provider.id}" role="listitem">
            <span class="navigation-provider-mark" aria-hidden="true">${provider.id === "waze" ? "W" : provider.id === "google" ? "G" : "A"}</span>
            <span class="navigation-provider-copy">
              <strong>${escapeHtml(provider.label)}</strong>
              <small>${escapeHtml(provider.description)}</small>
            </span>
            ${preferred === provider.id ? '<span class="badge navigation-preferred-badge">Preferred</span>' : '<span class="customer-account-chevron" aria-hidden="true">›</span>'}
          </button>`).join("")}
      </div>

      <label class="navigation-remember-choice">
        <input type="checkbox" id="rememberNavigationChoice" ${preferred ? "checked" : ""} />
        <span>
          <strong>Remember my choice</strong>
          <small>Yagoya will highlight it next time, but will still ask which navigation app to open.</small>
        </span>
      </label>
    </div>`);

  app.dialog.querySelectorAll("[data-navigation-provider]").forEach(button => {
    button.addEventListener("click", () => {
      const provider = button.dataset.navigationProvider;
      const remember = app.dialog.querySelector("#rememberNavigationChoice")?.checked;
      if (remember) setPreferredNavigationProvider(provider);
      else clearPreferredNavigationProvider();

      const url = directionsUrl(destination, { label: merchant.name, provider });
      app.closeDialog();
      window.location.assign(url);
    });
  });
}

function applyMenuFilter(app) {
  const query = (app.customerMenuQuery || "").trim().toLowerCase();
  const category = app.customerCategory || "All";
  const cards = [...app.root.querySelectorAll("[data-open-product]")];
  let visible = 0;

  cards.forEach(card => {
    const matchesQuery = !query || card.dataset.menuSearch.includes(query);
    const matchesCategory = category === "All" || card.dataset.menuCategory === category;
    card.hidden = !(matchesQuery && matchesCategory);
    if (!card.hidden) visible += 1;
  });

  const empty = app.root.querySelector("#menuFilterEmpty");
  if (empty) empty.hidden = visible !== 0;
}

function openLocationDialog(app) {
  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><h2>Change location</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <label class="field location-autocomplete-field">Location
        <input id="areaSearch" value="${escapeHtml(app.location.label)}" placeholder="Suburb, township, town, street or place" autocomplete="off" aria-autocomplete="list" aria-controls="locationSuggestions" />
        <div class="location-suggestions" id="locationSuggestions" role="listbox" hidden></div>
      </label>
      <button class="btn primary customer-primary-action" id="searchArea">Use this location</button>
      <button class="btn ghost customer-primary-action" id="useLocation">◎ Use my current location</button>
      <div class="muted small" id="locationMessage">Used only to find nearby merchants unless you choose a delivery address.</div>
    </div>`);

  const input = app.dialog.querySelector("#areaSearch");
  const suggestions = app.dialog.querySelector("#locationSuggestions");
  const message = app.dialog.querySelector("#locationMessage");
  let timer = null;
  let controller = null;
  let latestRequest = 0;

  const clearSuggestions = () => {
    suggestions.innerHTML = "";
    suggestions.hidden = true;
  };

  const chooseSuggestion = item => {
    input.value = item.label;
    clearSuggestions();
    app.setCustomerLocation(item);
    app.closeDialog();
  };

  const renderSuggestions = items => {
    suggestions.innerHTML = items.map((item, index) => `
      <button type="button" class="location-suggestion" role="option" data-location-index="${index}">
        <span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.type || "Place")}</small>
      </button>`).join("");
    suggestions.hidden = items.length === 0;
    suggestions.querySelectorAll("[data-location-index]").forEach(button => {
      button.addEventListener("click", () => chooseSuggestion(items[Number(button.dataset.locationIndex)]));
    });
  };

  const requestSuggestions = () => {
    window.clearTimeout(timer);
    controller?.abort();
    const query = input.value.trim();
    if (query.length < 2) { clearSuggestions(); return; }
    timer = window.setTimeout(async () => {
      const requestId = ++latestRequest;
      controller = new AbortController();
      try {
        const items = await app.suggestLocations(query, { limit: 6, signal: controller.signal });
        if (requestId === latestRequest && input.value.trim() === query) renderSuggestions(items);
      } catch (error) {
        if (error?.name !== "AbortError") clearSuggestions();
      }
    }, 280);
  };

  const submitArea = async () => {
    const value = input?.value || "";
    if (!value.trim()) return;
    controller?.abort();
    clearSuggestions();
    message.textContent = "Finding that location…";
    try {
      await app.searchArea(value);
      app.closeDialog();
    } catch (error) {
      message.textContent = error.message;
    }
  };

  input?.addEventListener("input", requestSuggestions);
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); submitArea(); }
    if (event.key === "Escape") clearSuggestions();
  });
  app.dialog.querySelector("#searchArea")?.addEventListener("click", submitArea);
  app.dialog.querySelector("#useLocation")?.addEventListener("click", async () => {
    controller?.abort();
    clearSuggestions();
    message.textContent = "Requesting your location…";
    try {
      await app.useCurrentLocation();
      app.customerSection = "home";
      app.closeDialog();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

function openCustomerSupport(app) {
  const customer = app.repos.users.customer();
  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><div><span class="eyebrow">Yagoya support</span><h2>How can we help?</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="customerSupportForm" class="form-grid">
        <label class="field full">Subject<input id="customerSupportSubject" required /></label>
        <label class="field full">Message<textarea id="customerSupportMessage" rows="5" required></textarea></label>
        <button class="btn primary field full">Send to Yagoya</button>
      </form>
    </div>`);
  app.dialog.querySelector("#customerSupportForm").addEventListener("submit", event => {
    event.preventDefault();
    app.commands.createSupportCase({ source: "customer", sourceId: customer.id, sourceName: customer.name, subject: app.dialog.querySelector("#customerSupportSubject").value, message: app.dialog.querySelector("#customerSupportMessage").value, priority: "normal" });
    app.closeDialog();
    app.toast("Your request is now visible to Yagoya Support.", { title: "Support request sent" });
    app.render();
  });
}

function openProduct(app, productId) {
  const product = app.repos.products.get(productId);
  if (!product) return;

  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><h2>${escapeHtml(product.name)}</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="customer-product-detail-visual" aria-hidden="true">${product.emoji || "🥪"}</div>
      <span class="badge">${escapeHtml(product.category)}</span>
      <p>${escapeHtml(product.desc || "")}</p>
      <div class="summary-line total"><span>Price</span><strong>${money(product.priceCents)}</strong></div>
      <button class="btn primary customer-primary-action" id="dialogAddProduct">Add to order</button>
    </div>`);

  app.dialog.querySelector("#dialogAddProduct")?.addEventListener("click", () => {
    app.addToCart(product.id);
    app.closeDialog();
    app.toast(`${product.name} added to your order.`);
  });
}

function openCheckout(app) {
  if (!app.authUser) {
    app.pendingCustomerAction = "checkout";
    app.customerSection = "account";
    app.customerAccountPanel = "security";
    app.customerAuthMode = "signin";
    app.customerAuthError = "";
    app.customerAuthPrompt = "Sign in or create an account to continue checkout. Your cart is saved.";
    app.render();
    window.scrollTo(0, 0);
    return;
  }
  const controls = app.repos.platform.controls();
  if (!controls.orderingEnabled) return alert("Yagoya ordering is temporarily paused.");
  if (!controls.paymentsEnabled) return alert("Yagoya payments are temporarily unavailable.");
  const merchant = app.repos.merchants.get(app.selectedMerchantId);
  if (!merchant || !app.cart.length) return;
  const customer = app.repos.users.customer();
  const authenticatedName = app.authUser?.displayName || customer.name || "";
  const authenticatedEmail = app.authUser?.email || customer.email || "";
  const checkoutLines = () => app.cart.map(line => ({ productId: line.productId, qty: line.qty }));

  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><h2>Checkout</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="form-grid">
        <label class="field">Name<input id="checkoutName" value="${escapeHtml(authenticatedName)}" /></label>
        <label class="field">Phone<input id="checkoutPhone" value="${escapeHtml(customer.phone)}" /></label>
        <label class="field">Email<input id="checkoutEmail" type="email" value="${escapeHtml(authenticatedEmail)}" /></label>
        ${app.deliveryMode === "Home Delivery" ? '<label class="field">Delivery address<input id="checkoutAddress" placeholder="Street / complex / suburb" required /></label>' : ""}
        <label class="field">When<select id="checkoutTiming"><option value="asap">As soon as possible</option><option value="scheduled">Schedule</option></select></label>
        <label class="field" id="scheduledField" hidden>Scheduled time<input id="checkoutSchedule" type="datetime-local" /></label>
        <label class="field">Promo code<input id="checkoutPromo" autocomplete="off" placeholder="Optional" /></label>
        <label class="field">Tip<select id="checkoutTip"><option value="0">No tip</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option></select></label>
        <label class="field full">Order notes<textarea id="checkoutNotes" rows="3" placeholder="No onions, extra sauce..."></textarea></label>
      </div>
      <div class="card soft" style="margin-top:14px" id="checkoutSummary"></div>
      <div class="muted small" id="checkoutPricingMessage" style="margin-top:8px"></div>
      <button class="btn primary customer-primary-action" id="payButton">Continue to secure payment</button>
    </div>`);

  const summary = app.dialog.querySelector("#checkoutSummary");
  const pricingMessage = app.dialog.querySelector("#checkoutPricingMessage");
  const getPricing = () => {
    const promoCode = app.dialog.querySelector("#checkoutPromo").value.trim().toUpperCase();
    const promo = promoCode ? app.repos.promotions.byCode(promoCode) : null;
    const subtotal = cartSubtotal(app);
    const tipPercent = Number(app.dialog.querySelector("#checkoutTip").value || 0);
    const tipCents = Math.round(subtotal * tipPercent / 100);
    if (promoCode && !promo) throw new Error("Promotion code is not valid.");
    return calculateOrderPricing({ merchant, items: checkoutLines(), productsById: id => app.repos.products.get(id), promo, tipCents, fulfilment: app.deliveryMode === "Home Delivery" ? { type: "delivery" } : { type: "pickup" } });
  };
  const renderPricing = () => {
    try {
      const price = getPricing();
      summary.innerHTML = `
        <div class="summary-line"><span>Merchant</span><strong>${escapeHtml(merchant.name)}</strong></div>
        <div class="summary-line"><span>Subtotal</span><strong>${money(price.subtotalCents)}</strong></div>
        ${price.discountCents ? `<div class="summary-line"><span>Promotion ${escapeHtml(price.promoCode)}</span><strong>−${money(price.discountCents)}</strong></div>` : ""}
        <div class="summary-line"><span>Delivery</span><strong>${money(price.deliveryFeeCents)}</strong></div>
        ${price.tipCents ? `<div class="summary-line"><span>Tip</span><strong>${money(price.tipCents)}</strong></div>` : ""}
        <div class="summary-line total"><span>To pay</span><strong>${money(price.totalCents)}</strong></div>`;
      pricingMessage.textContent = price.promoCode ? `Promotion ${price.promoCode} applied.` : "Final pricing is verified by Yagoya before payment.";
      return price;
    } catch (error) {
      summary.innerHTML = `<div class="notice">${escapeHtml(error.message)}</div>`;
      pricingMessage.textContent = "";
      return null;
    }
  };
  renderPricing();
  app.dialog.querySelector("#checkoutPromo")?.addEventListener("input", renderPricing);
  app.dialog.querySelector("#checkoutTip")?.addEventListener("change", renderPricing);
  app.dialog.querySelector("#checkoutTiming")?.addEventListener("change", event => {
    app.dialog.querySelector("#scheduledField").hidden = event.currentTarget.value !== "scheduled";
  });

  const checkoutIdempotencyKey = uid("checkout");
  app.dialog.querySelector("#payButton")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Confirming payment…";
    try {
      const pricing = getPricing();
      if (!pricing) throw new Error("Pricing could not be confirmed.");
      const customerDetails = {
        name: app.dialog.querySelector("#checkoutName").value.trim(),
        phone: app.dialog.querySelector("#checkoutPhone").value.trim(),
        email: app.dialog.querySelector("#checkoutEmail").value.trim()
      };
      const deliveryAddress = app.dialog.querySelector("#checkoutAddress")?.value.trim() || "";
      if (!customerDetails.name || !customerDetails.phone || !customerDetails.email) throw new Error("Name, phone and email are required.");
      if (pricing.subtotalCents < merchant.minOrderCents) throw new Error(`Minimum order is ${money(merchant.minOrderCents)}.`);
      if (app.deliveryMode === "Home Delivery" && !app.repos.platform.controls().deliveryEnabled) throw new Error("Yagoya delivery is temporarily unavailable.");
      if (app.deliveryMode === "Home Delivery" && !deliveryAddress) throw new Error("Delivery address is required.");
      const scheduled = app.dialog.querySelector("#checkoutTiming").value === "scheduled" ? app.dialog.querySelector("#checkoutSchedule").value : null;
      if (app.dialog.querySelector("#checkoutTiming").value === "scheduled" && !scheduled) throw new Error("Choose a scheduled order time.");

      const fulfilment = app.deliveryMode === "Home Delivery"
        ? { type: "delivery", provider: merchant.delivery?.providerPreference || "yagoya_fleet", destination: { address: deliveryAddress, latitude: app.location.lat, longitude: app.location.lng } }
        : { type: "pickup" };

      const result = await app.commands.checkout({
        merchantId: merchant.id,
        customerId: customer.id,
        customerDetails,
        mode: app.deliveryMode,
        address: deliveryAddress,
        notes: app.dialog.querySelector("#checkoutNotes").value.trim(),
        fulfilment,
        promoCode: app.dialog.querySelector("#checkoutPromo").value.trim().toUpperCase(),
        tipCents: pricing.tipCents,
        scheduledFor: scheduled,
        idempotencyKey: checkoutIdempotencyKey,
        items: checkoutLines()
      });
      app.cart = [];
      app.customerSection = "orders";
      app.closeDialog();
      app.toast(app.deliveryMode === "Home Delivery"
        ? `Order ${result.orderNumber} was sent to ${merchant.name} and the delivery task was created.`
        : `Order ${result.orderNumber} was sent to ${merchant.name}.`, { title: "Payment verified and order placed" });
      app.render();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Continue to secure payment";
      alert(error.message);
    }
  });
}

function openTracking(app, orderId) {
  const order = app.repos.orders.get(orderId);
  const task = app.repos.delivery.taskForOrder(orderId);
  if (!order || !task) return;
  const merchant = app.repos.merchants.get(task.merchantId);
  const driver = task.assignedDriverId ? app.repos.delivery.driver(task.assignedDriverId) : null;
  const vehicle = driver ? app.repos.delivery.vehicle(driver.vehicleId) : null;
  const location = driver ? app.repos.delivery.currentLocation(driver.id) : null;
  const events = app.repos.delivery.events(task.id, { limit: 50, direction: "desc" }).items;
  const progress = deliveryProgress(task.status);
  const eta = task.estimatedArrivalAt && task.status !== "delivered" ? formatDateTime(task.estimatedArrivalAt) : "—";

  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><h2>Delivery tracking</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="merchant-title"><strong>${escapeHtml(order.orderNumber || order.id)}</strong><span class="badge dark">${escapeHtml(deliveryStatusLabel(task.status))}</span></div>
      <div class="progress delivery-progress" style="margin:14px 0"><span style="width:${progress}%"></span></div>
      <div class="grid grid-2">
        <div class="card soft">
          <span class="eyebrow">Route</span>
          <div class="summary-line"><span>Pickup</span><strong>${escapeHtml(merchant?.name || task.pickup.address)}</strong></div>
          <div class="summary-line"><span>Drop-off</span><strong>${escapeHtml(task.dropoff.address)}</strong></div>
          <div class="summary-line"><span>ETA</span><strong>${escapeHtml(eta)}</strong></div>
        </div>
        <div class="card">
          <span class="eyebrow">Driver</span>
          ${driver ? `
            <h3 style="margin:8px 0 4px">${escapeHtml(driver.name)}</h3>
            <div class="muted small">${escapeHtml(vehicle?.type || "vehicle")} · ${escapeHtml(vehicle?.registration || "")}</div>
            <div class="rating-line"><span>⭐</span><strong>${Number(driver.rating || 0).toFixed(1)}</strong><span class="muted small">${driver.completedDeliveries} deliveries</span></div>
            <div class="muted small" style="margin-top:8px">${location ? `Location snapshot received ${formatDateTime(location.recordedAt)}` : "Waiting for location snapshot"}</div>
          ` : '<div class="muted" style="margin-top:8px">A driver has not been assigned yet.</div>'}
        </div>
      </div>
      ${task.status !== "delivered" && task.verification?.pin ? `<div class="notice info" style="margin-top:14px"><strong>Delivery PIN: ${escapeHtml(task.verification.pin)}</strong><br><span class="small">Give this PIN to the driver only when your order is handed to you.</span></div>` : ""}
      <h3 style="margin-top:20px">Delivery timeline</h3>
      <div class="timeline">${events.map(event => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(event.message)}</strong><div class="muted small">${formatDateTime(event.createdAt)}</div></div></div>`).join("")}</div>
      <button class="btn ghost customer-primary-action" id="refreshTracking">Refresh tracking snapshot</button>
    </div>`);

  app.dialog.querySelector("#refreshTracking")?.addEventListener("click", () => openTracking(app, orderId));
}

function openRating(app, orderId) {
  const order = app.repos.orders.get(orderId);
  const merchant = app.repos.merchants.get(order.merchantId);

  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><h2>Rate your kota</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="notice"><strong>Verified Yagoya Order</strong><br><span class="small">${escapeHtml(order.orderNumber || order.id)} · ${escapeHtml(merchant.name)}</span></div>
      <form id="ratingForm" style="margin-top:14px">
        ${ratingField("Overall experience", "overall")}
        ${ratingField("Food / kota quality", "food")}
        ${ratingField("Service experience", "service")}
        <label class="field" style="margin-top:14px">Optional comment<textarea id="ratingComment" rows="3" placeholder="Tell Yagoya what stood out..."></textarea></label>
        <button class="btn primary customer-primary-action">Submit verified rating</button>
      </form>
    </div>`);

  app.dialog.querySelectorAll(".stars").forEach(group => {
    group.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        group.dataset.value = button.dataset.value;
        group.querySelectorAll("button").forEach(item => item.classList.toggle("selected", Number(item.dataset.value) <= Number(button.dataset.value)));
      });
    });
  });

  app.dialog.querySelector("#ratingForm").addEventListener("submit", event => {
    event.preventDefault();
    const values = Object.fromEntries([...app.dialog.querySelectorAll(".stars")].map(group => [group.dataset.field, Number(group.dataset.value || 0)]));
    if (!values.overall || !values.food || !values.service) return alert("Please rate the overall experience, food and service.");
    app.commands.submitRating({ orderId, ...values, comment: app.dialog.querySelector("#ratingComment").value });
    app.closeDialog();
    app.toast("Your verified-order feedback has been recorded.", { title: "Rating submitted" });
    app.render();
  });
}

function ratingField(label, field) {
  return `
    <div style="margin-top:13px">
      <div class="strong small" style="margin-bottom:7px">${label}</div>
      <div class="stars" data-field="${field}" data-value="0">
        ${[1, 2, 3, 4, 5].map(value => `<button data-value="${value}" aria-label="${value} stars">★</button>`).join("")}
      </div>
    </div>`;
}
