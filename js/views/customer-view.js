import { escapeHtml, formatDateTime, money, uid } from "../core/utils.js";
import { calculateOrderPricing } from "../services/pricing-service.js";
import { qualityBadge, isEligibleForProximityRecommendation } from "../services/quality-service.js";
import { deliveryProgress, deliveryStatusLabel } from "../services/delivery-service.js";

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
    <article class="customer-merchant-card ${index === 0 ? "closest" : ""}" data-select-merchant="${merchant.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(merchant.name)} menu">
      <div class="customer-merchant-main">
        <div class="customer-merchant-heading">
          <h3>${escapeHtml(merchant.name)}</h3>
          ${index === 0 ? '<span class="badge dark">Closest</span>' : ""}
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
          <div><strong>${escapeHtml(merchant?.name || "GoodKota merchant")}</strong><div class="muted small">${escapeHtml(order.orderNumber || order.id)} · ${formatDateTime(order.createdAt)}</div></div>
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
  return `
    ${locationStrip(app)}
    <section class="customer-screen customer-home-screen">
      <div class="customer-greeting">
        <div class="customer-greeting-copy">
          <span class="eyebrow">Hi ${escapeHtml(customer.name.split(" ")[0] || "there")}</span>
          <h1>Find a good kota nearby.</h1>
          <p>Closest first. Verified quality visible before you order.</p>
        </div>
        <img class="customer-greeting-mark" src="./assets/goodkota-logo.png" alt="" aria-hidden="true" />
      </div>

      <label class="customer-search" aria-label="Search nearby merchants">
        <span aria-hidden="true">⌕</span>
        <input id="merchantSearch" type="search" placeholder="Search merchants" autocomplete="off" />
      </label>

      <div class="customer-home-meta">
        <strong>${ranked.length} nearby</strong>
        <span class="muted small">${eligible} meeting the GoodKota Standard</span>
      </div>

      <div class="customer-merchant-list" id="merchantList">
        ${ranked.map((merchant, index) => merchantCard(merchant, index)).join("") || '<div class="empty">No GoodKota merchants are available near this location yet.</div>'}
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
          <span>GoodKota will show the closest available merchants on Home.</span>
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
          <span>Start with a nearby GoodKota merchant.</span>
          <button class="btn primary" data-customer-section="home">Find a merchant</button>
        </div>`}
    </section>`;
}

function renderAccount(app) {
  const customer = app.repos.users.customer();
  return `
    ${locationStrip(app)}
    <section class="customer-screen">
      <div class="customer-screen-title"><h1>Account</h1><p>Your GoodKota account essentials.</p></div>
      <div class="card customer-account-card">
        <div class="customer-account-row"><span>Name</span><strong>${escapeHtml(customer.name)}</strong></div>
        <div class="customer-account-row"><span>Phone</span><strong>${escapeHtml(customer.phone)}</strong></div>
        <div class="customer-account-row"><span>Email</span><strong>${escapeHtml(customer.email)}</strong></div>
      </div>
      <div class="card customer-account-card">
        <div>
          <strong>Nearby quality alerts</strong>
          <p class="muted small">Optional alerts for nearby merchants meeting the GoodKota Standard.</p>
        </div>
        <button class="btn ${customer.notificationPreferences.nearbyQualityMerchants ? "dark" : "primary"}" id="notificationButton">${customer.notificationPreferences.nearbyQualityMerchants ? "Turn off" : "Enable alerts"}</button>
      </div>
      <div class="card customer-account-card action-card">
        <div><strong>Help & support</strong><p class="muted small">Send an issue to the GoodKota support team.</p></div>
        <button class="btn ghost" id="customerSupportButton">Get help</button>
      </div>
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
  app.root.querySelectorAll("[data-rate-order]").forEach(button => button.addEventListener("click", () => openRating(app, button.dataset.rateOrder)));
  app.root.querySelectorAll("[data-track-order]").forEach(button => button.addEventListener("click", () => openTracking(app, button.dataset.trackOrder)));
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
      <label class="field">Area<input id="areaSearch" value="${escapeHtml(app.location.label)}" placeholder="Midrand, Tembisa, Soweto..." /></label>
      <button class="btn primary customer-primary-action" id="searchArea">Use this area</button>
      <button class="btn ghost customer-primary-action" id="useLocation">◎ Use my current location</button>
      <div class="muted small" id="locationMessage">Location is used to rank the nearest merchants first.</div>
    </div>`);

  const submitArea = async () => {
    const value = app.dialog.querySelector("#areaSearch")?.value || "";
    const message = app.dialog.querySelector("#locationMessage");
    if (!value.trim()) return;
    message.textContent = "Finding that location…";
    try {
      await app.searchArea(value);
      app.closeDialog();
    } catch (error) {
      message.textContent = error.message;
    }
  };

  app.dialog.querySelector("#searchArea")?.addEventListener("click", submitArea);
  app.dialog.querySelector("#areaSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter") submitArea();
  });
  app.dialog.querySelector("#useLocation")?.addEventListener("click", async () => {
    const message = app.dialog.querySelector("#locationMessage");
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
      <div class="dialog-head"><div><span class="eyebrow">GoodKota support</span><h2>How can we help?</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="customerSupportForm" class="form-grid">
        <label class="field full">Subject<input id="customerSupportSubject" required /></label>
        <label class="field full">Message<textarea id="customerSupportMessage" rows="5" required></textarea></label>
        <button class="btn primary field full">Send to GoodKota</button>
      </form>
    </div>`);
  app.dialog.querySelector("#customerSupportForm").addEventListener("submit", event => {
    event.preventDefault();
    app.commands.createSupportCase({ source: "customer", sourceId: customer.id, sourceName: customer.name, subject: app.dialog.querySelector("#customerSupportSubject").value, message: app.dialog.querySelector("#customerSupportMessage").value, priority: "normal" });
    app.closeDialog();
    app.toast("Support request sent to GoodKota.");
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
  const controls = app.repos.platform.controls();
  if (!controls.orderingEnabled) return alert("GoodKota ordering is temporarily paused.");
  if (!controls.paymentsEnabled) return alert("GoodKota payments are temporarily unavailable.");
  const merchant = app.repos.merchants.get(app.selectedMerchantId);
  if (!merchant || !app.cart.length) return;
  const customer = app.repos.users.customer();
  const checkoutLines = () => app.cart.map(line => ({ productId: line.productId, qty: line.qty }));

  app.openDialog(`
    <div class="dialog-inner customer-dialog-inner">
      <div class="dialog-head"><h2>Checkout</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="form-grid">
        <label class="field">Name<input id="checkoutName" value="${escapeHtml(customer.name)}" /></label>
        <label class="field">Phone<input id="checkoutPhone" value="${escapeHtml(customer.phone)}" /></label>
        <label class="field">Email<input id="checkoutEmail" type="email" value="${escapeHtml(customer.email)}" /></label>
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
      pricingMessage.textContent = price.promoCode ? `Promotion ${price.promoCode} applied.` : "Final pricing is verified by GoodKota before payment.";
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
      if (app.deliveryMode === "Home Delivery" && !app.repos.platform.controls().deliveryEnabled) throw new Error("GoodKota delivery is temporarily unavailable.");
      if (app.deliveryMode === "Home Delivery" && !deliveryAddress) throw new Error("Delivery address is required.");
      const scheduled = app.dialog.querySelector("#checkoutTiming").value === "scheduled" ? app.dialog.querySelector("#checkoutSchedule").value : null;
      if (app.dialog.querySelector("#checkoutTiming").value === "scheduled" && !scheduled) throw new Error("Choose a scheduled order time.");

      const fulfilment = app.deliveryMode === "Home Delivery"
        ? { type: "delivery", provider: merchant.delivery?.providerPreference || "goodkota_fleet", destination: { address: deliveryAddress, latitude: app.location.lat, longitude: app.location.lng } }
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
        ? `Payment verified. Order ${result.orderNumber} sent to ${merchant.name}; delivery task created.`
        : `Payment verified. Order ${result.orderNumber} sent to ${merchant.name}.`);
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
      <div class="notice"><strong>Verified GoodKota Order</strong><br><span class="small">${escapeHtml(order.orderNumber || order.id)} · ${escapeHtml(merchant.name)}</span></div>
      <form id="ratingForm" style="margin-top:14px">
        ${ratingField("Overall experience", "overall")}
        ${ratingField("Food / kota quality", "food")}
        ${ratingField("Service experience", "service")}
        <label class="field" style="margin-top:14px">Optional comment<textarea id="ratingComment" rows="3" placeholder="Tell GoodKota what stood out..."></textarea></label>
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
    app.toast("Thanks. Your verified rating was recorded.");
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
