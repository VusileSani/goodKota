import { escapeHtml, formatDateTime, money, toCents, uid } from "../core/utils.js";
import { merchantQualityNotice, qualityBadge } from "../services/quality-service.js";
import { deliveryStatusLabel } from "../services/delivery-service.js";
import { maskBankAccount } from "../services/payment-service.js";
import { merchantStorefrontUrl, qrImageUrl } from "../services/storefront-service.js";

const BRAND_MATERIALS = [
  { code: "banner-counter", group: "Banners", name: "Counter banner", variants: ["Countertop", "Compact storefront"], description: "A compact Yagoya banner for the ordering counter or collection area." },
  { code: "banner-pullup", group: "Banners", name: "Pull-up banner", variants: ["Standard pull-up", "Event / activation"], description: "Portable Yagoya signage for storefronts, activations and events." },
  { code: "sticker-order-seal", group: "Stickers", name: "Order & packaging stickers", variants: ["Order seals", "Takeaway bag stickers"], description: "Yagoya seals and branded stickers for customer orders." },
  { code: "serviettes", group: "Customer experience", name: "Yagoya serviettes", variants: ["Standard pack"], description: "Optional Yagoya-branded serviettes for in-store and takeaway service." },
  { code: "table-materials", group: "Customer experience", name: "Table & counter materials", variants: ["Table cards", "Counter cards"], description: "Compact Yagoya customer-experience and discovery material." },
  { code: "verified-kit", group: "Verified", name: "Yagoya Verified kit", variants: ["Window & counter kit"], description: "Verification-specific physical material. The live Yagoya app status remains the source of truth.", verifiedOnly: true }
];

export function renderMerchantView(app) {
  const merchants = app.repos.merchants.list({ limit: 50, sortBy: "createdAt", direction: "asc" }).items;
  if (!merchants.length) {
    app.root.innerHTML = '<div class="empty">No merchants have been onboarded yet.</div>';
    return;
  }

  if (!app.currentMerchantId || !app.repos.merchants.get(app.currentMerchantId)) app.currentMerchantId = merchants[0].id;
  const merchant = app.repos.merchants.get(app.currentMerchantId);
  const orders = app.repos.orders.listForMerchant(merchant.id, { limit: 50 }).items;
  const products = app.repos.products.listForMerchant(merchant.id, { limit: 100 }).items;
  const supportCases = app.repos.governance.supportCases({ merchantId: merchant.id, limit: 25 }).items;
  const materialOrders = app.repos.brandMaterials.listOrdersForMerchant(merchant.id, { limit: 25 }).items;
  const needsAction = orders.filter(order => ["pending", "accepted", "ready"].includes(order.status)).length;
  const activeDeliveries = orders.filter(order => {
    const task = app.repos.delivery.taskForOrder(order.id);
    return task && !["delivered", "cancelled"].includes(task.status);
  }).length;
  const quality = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
  const merchantRatings = app.store.ratingsForMerchant(merchant.id);
  const qualityNotice = merchantQualityNotice(merchantRatings, merchant.qualitySummary);
  const qualityWorkflowNeedsAttention = ["watch", "intervention", "probation"].includes(merchant.qualityWorkflow?.status);
  const showQualityNotice = qualityNotice.concern || qualityWorkflowNeedsAttention;
  const openSupport = supportCases.filter(item => ["open", "in_progress"].includes(item.status)).length;
  const section = app.merchantSection || "overview";

  app.root.innerHTML = `
    <section class="actor-hero merchant-hero">
      <div><span class="eyebrow">Merchant workspace</span><h2>${escapeHtml(merchant.name)}</h2><p>${escapeHtml(merchant.address || "")} · Focused operational tools.</p></div>
      <select id="merchantSwitcher" class="btn hero-switcher merchant-switcher">
        ${merchants.map(item => `<option value="${item.id}" ${item.id === merchant.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select>
    </section>

    <nav class="section-tabs merchant-section-tabs" aria-label="Merchant workspace sections">
      ${merchantTab("overview", "Overview", section, needsAction || null)}
      ${merchantTab("orders", "Orders", section, needsAction || null)}
      ${merchantTab("menu", "Menu", section)}
      ${merchantTab("quality", "Quality", section, showQualityNotice ? 1 : null)}
      ${merchantTab("brand", "Brand Materials", section, materialOrders.filter(item => item.status !== "completed").length || null)}
      ${merchantTab("settings", "Store Settings", section)}
      ${merchantTab("support", "Support", section, openSupport || null)}
    </nav>

    ${section === "overview" ? overviewSection(app, merchant, { orders, products, needsAction, activeDeliveries, quality, qualityNotice, showQualityNotice, openSupport, materialOrders }) : ""}
    ${section === "orders" ? ordersSection(app, merchant, orders) : ""}
    ${section === "menu" ? menuSection(products) : ""}
    ${section === "quality" ? qualitySection(merchant, quality, qualityNotice, showQualityNotice) : ""}
    ${section === "brand" ? brandMaterialsSection(merchant, materialOrders) : ""}
    ${section === "settings" ? settingsSection(merchant) : ""}
    ${section === "support" ? supportSection(supportCases) : ""}
  `;

  bindMerchantNavigation(app);
  app.root.querySelector("#merchantSwitcher").addEventListener("change", event => {
    app.currentMerchantId = event.currentTarget.value;
    app.merchantSection = "overview";
    app.render();
  });

  if (section === "orders") bindOrdersSection(app, merchant);
  if (section === "menu") bindMenuSection(app, merchant);
  if (section === "brand") bindBrandSection(app, merchant);
  if (section === "settings") bindSettingsSection(app, merchant);
  if (section === "support") bindSupportSection(app, merchant);
}

function merchantTab(value, label, current, count = null) {
  return `<button class="section-tab ${value === current ? "active" : ""}" data-merchant-section="${value}">${label}${count ? `<span>${count}</span>` : ""}</button>`;
}

function bindMerchantNavigation(app) {
  app.root.querySelectorAll("[data-merchant-section]").forEach(button => {
    button.addEventListener("click", () => {
      app.merchantSection = button.dataset.merchantSection;
      app.render();
      window.scrollTo(0, 0);
    });
  });
  app.root.querySelectorAll("[data-jump-merchant]").forEach(button => {
    button.addEventListener("click", () => {
      app.merchantSection = button.dataset.jumpMerchant;
      app.render();
      window.scrollTo(0, 0);
    });
  });
}

function overviewSection(app, merchant, data) {
  const pendingMaterial = data.materialOrders.find(item => item.status !== "completed");
  const attention = [
    data.needsAction ? { tone: "warn", title: `${data.needsAction} order${data.needsAction === 1 ? "" : "s"} need attention`, detail: "Open the Orders workspace to continue service.", action: "orders" } : null,
    data.showQualityNotice ? { tone: "warn", title: "Quality signal needs attention", detail: "Review anonymised verified-customer feedback and Yagoya guidance.", action: "quality" } : null,
    data.openSupport ? { tone: "info", title: `${data.openSupport} open support case${data.openSupport === 1 ? "" : "s"}`, detail: "Track responses from Yagoya Support.", action: "support" } : null,
    pendingMaterial ? { tone: "info", title: "Brand material order in progress", detail: `${pendingMaterial.itemName} × ${pendingMaterial.quantity} · ${pendingMaterial.status}`, action: "brand" } : null
  ].filter(Boolean);

  return `
    <div class="metric-strip merchant-overview-metrics">
      <div class="stat"><span class="muted">Orders needing action</span><b>${data.needsAction}</b></div>
      <div class="stat"><span class="muted">Active deliveries</span><b>${data.activeDeliveries}</b></div>
      <div class="stat"><span class="muted">Menu items</span><b>${data.products.length}</b></div>
      <div class="stat"><span class="muted">Quality</span><b style="font-size:1rem"><span class="badge ${data.quality.tone}">${data.quality.label}</span></b></div>
    </div>

    <section class="section grid grid-2 merchant-overview-grid">
      <div class="card">
        <div class="section-head"><div><h3>Needs attention</h3><p>Exceptions first. Routine tools stay in their own workspace.</p></div></div>
        ${attention.length ? `<div class="attention-list">${attention.map(item => `<button class="attention-item" data-jump-merchant="${item.action}"><span class="status-dot ${item.tone}"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><b>›</b></button>`).join("")}</div>` : '<div class="empty">Nothing needs immediate attention.</div>'}
      </div>
      <div class="card merchant-overview-actions">
        <span class="eyebrow">Common tasks</span>
        <h3>Go straight to the work.</h3>
        <div class="compact-action-list">
          <button class="settings-row" data-jump-merchant="orders"><span><strong>Manage orders</strong><small>Accept, prepare and complete customer orders.</small></span><b>›</b></button>
          <button class="settings-row" data-jump-merchant="menu"><span><strong>Manage menu</strong><small>Add items, prices, availability and photos.</small></span><b>›</b></button>
          <button class="settings-row" data-jump-merchant="brand"><span><strong>Order Yagoya materials</strong><small>Banners, stickers, serviettes and verified materials.</small></span><b>›</b></button>
          <button class="settings-row" data-jump-merchant="settings"><span><strong>Store settings</strong><small>Preparation, delivery, settlement and storefront tools.</small></span><b>›</b></button>
        </div>
      </div>
    </section>`;
}

function ordersSection(app, merchant, orders) {
  const filter = app.merchantOrderFilter || "active";
  const groups = {
    active: ["pending", "accepted", "ready", "out_for_delivery"],
    new: ["pending"],
    progress: ["accepted", "ready", "out_for_delivery"],
    completed: ["completed"],
    cancelled: ["cancelled"]
  };
  const statuses = groups[filter] || groups.active;
  const filtered = orders.filter(order => statuses.includes(order.status));
  return `
    <section class="section-head"><div><h2>Orders</h2><p>Only order work is shown here.</p></div></section>
    <section class="section merchant-filter-row" aria-label="Order filters">
      ${orderFilterButton("active", "Active", filter, orders.filter(order => groups.active.includes(order.status)).length)}
      ${orderFilterButton("new", "New", filter, orders.filter(order => order.status === "pending").length)}
      ${orderFilterButton("progress", "In progress", filter, orders.filter(order => groups.progress.includes(order.status)).length)}
      ${orderFilterButton("completed", "Completed", filter)}
      ${orderFilterButton("cancelled", "Cancelled", filter)}
    </section>
    <section class="section"><div class="table-wrap">${ordersTable(app, filtered)}</div></section>`;
}

function orderFilterButton(value, label, current, count = null) {
  return `<button class="chip ${value === current ? "active" : ""}" data-order-filter="${value}">${label}${count ? ` · ${count}` : ""}</button>`;
}

function bindOrdersSection(app) {
  app.root.querySelectorAll("[data-order-filter]").forEach(button => button.addEventListener("click", () => {
    app.merchantOrderFilter = button.dataset.orderFilter;
    app.render();
  }));
  bindOrderActions(app, app.root);
  app.root.querySelectorAll("[data-open-order]").forEach(button => button.addEventListener("click", () => openOrderDetails(app, button.dataset.openOrder)));
}

function menuSection(products) {
  return `
    <section class="section-head"><div><h2>Menu</h2><p>${products.length} ${products.length === 1 ? "item" : "items"}. Select an item to edit it.</p></div><button class="btn primary" id="addProductButton">+ Add item</button></section>
    <section class="section"><div class="table-wrap">${catalogueTable(products)}</div></section>`;
}

function bindMenuSection(app, merchant) {
  app.root.querySelector("#addProductButton")?.addEventListener("click", () => openProduct(app, merchant));
  app.root.querySelectorAll("[data-edit-product]").forEach(button => button.addEventListener("click", () => openProduct(app, merchant, button.dataset.editProduct)));
}

function qualitySection(merchant, quality, qualityNotice, showQualityNotice) {
  return `
    <section class="section-head"><div><h2>Quality</h2><p>Verified customer feedback and Yagoya quality status. Customer identity remains protected.</p></div><span class="badge ${quality.tone}">${quality.label}</span></section>
    <div class="metric-strip">
      <div class="stat"><span class="muted">Verified ratings</span><b>${merchant.qualitySummary.count}</b></div>
      <div class="stat"><span class="muted">Overall</span><b>${merchant.qualitySummary.overall.toFixed(1)}</b></div>
      <div class="stat"><span class="muted">Recent poor</span><b>${qualityNotice.recentPoorCount || 0}</b></div>
      <div class="stat"><span class="muted">Review baseline</span><b>${qualityNotice.baselineReached ? "Reached" : `${merchant.qualitySummary.count}/10`}</b></div>
    </div>
    ${showQualityNotice ? `<section class="section"><div class="card merchant-quality-warning"><div class="quality-warning-head"><div><span class="eyebrow">Private merchant quality notice</span><h3>${qualityNotice.baselineReached ? "Recent verified feedback needs attention" : "Yagoya quality attention"}</h3></div><span class="badge warn">Attention</span></div><p>${qualityNotice.baselineReached ? "This is an early warning so your team can correct a trend before a formal Yagoya quality review." : "Your merchant is currently on a Yagoya quality watch or intervention. Formal automated review criteria begin after 10 verified customer ratings."}</p><div class="quality-warning-metrics">${qualityNotice.baselineReached ? `<span><strong>${qualityNotice.recentPoorCount}</strong> poor ratings in the last ${qualityNotice.recentWindow}</span>` : ""}<span><strong>${merchant.qualitySummary.count}</strong> verified ratings total</span></div>${qualityNotice.themes.length ? `<div class="quality-warning-themes">${qualityNotice.themes.map(theme => `<span class="quality-theme">${escapeHtml(theme)}</span>`).join("")}</div>` : ""}<p class="muted small">${escapeHtml(qualityNotice.privacyNote)}</p></div></section>` : `<section class="section"><div class="card"><strong>No current quality warning.</strong><p class="muted">Yagoya continues to evaluate verified-order feedback. The formal review baseline begins at 10 verified ratings, while serious patterns can still be escalated by Yagoya operations.</p></div></section>`}
    <section class="section"><div class="card"><span class="eyebrow">How this works</span><h3>Physical branding never overrides the app.</h3><p class="muted">Yagoya Verified is dynamic. A merchant may own Yagoya materials, but the current quality status shown to customers in Yagoya remains the source of truth.</p></div></section>`;
}

function brandMaterialsSection(merchant, materialOrders) {
  const verified = merchant.compliance?.status === "compliant" && merchant.qualitySummary?.signal === "healthy" && merchant.qualityWorkflow?.status === "healthy";
  const banners = BRAND_MATERIALS.filter(item => item.group === "Banners");
  const other = BRAND_MATERIALS.filter(item => item.group !== "Banners");
  return `
    <section class="section-head"><div><h2>Brand & Store Materials</h2><p>Optional Yagoya company merchandise and customer-experience materials. Order directly from this workspace.</p></div><span class="badge ${verified ? "ok" : "warn"}">${verified ? "Verified materials eligible" : "Verified kit restricted"}</span></section>

    <section class="section">
      <div class="section-head"><div><h3>Banners</h3><p>Select the banner you want and place the order here.</p></div></div>
      <div class="brand-catalogue-grid">${banners.map(item => brandMaterialCard(item, verified, "Order banner")).join("")}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Company merchandise</h3><p>Stickers, serviettes, customer-experience and verification materials.</p></div></div>
      <div class="brand-catalogue-grid">${other.map(item => brandMaterialCard(item, verified, item.verifiedOnly ? "Order verified kit" : "Order item")).join("")}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Material orders</h3><p>Submitted and previous Yagoya material orders.</p></div></div>
      ${materialOrderHistory(materialOrders)}
    </section>

    <section class="section"><div class="notice"><strong>Source of truth:</strong> owning Yagoya physical materials never guarantees current Verified status. Customers should rely on the live status shown in Yagoya.</div></section>`;
}

function brandMaterialCard(item, verified, buttonLabel) {
  const restricted = item.verifiedOnly && !verified;
  return `<article class="card brand-catalogue-card"><div><span class="eyebrow">${escapeHtml(item.group)}</span><h3>${escapeHtml(item.name)}</h3><p class="muted small">${escapeHtml(item.description)}</p></div><div class="brand-card-footer"><span class="badge ${restricted ? "warn" : "info"}">${restricted ? "Not currently eligible" : "Available"}</span><button class="btn ${restricted ? "ghost" : "primary"} small" data-order-material="${item.code}" ${restricted ? "disabled" : ""}>${escapeHtml(buttonLabel)}</button></div></article>`;
}

function materialOrderHistory(orders) {
  if (!orders.length) return '<div class="empty">No material orders yet.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Fulfilment</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>${orders.map(order => `<tr><td><strong>${escapeHtml(order.itemName)}</strong><div class="muted small">${escapeHtml(order.variant || "Standard")}</div></td><td>${order.quantity}</td><td>${escapeHtml(order.fulfilment === "collect" ? "Collection" : "Delivery")}</td><td><span class="badge info">${escapeHtml(order.status)}</span></td><td>${formatDateTime(order.createdAt)}</td><td><button class="btn ghost small" data-reorder-material="${order.id}">Reorder</button></td></tr>`).join("")}</tbody></table></div>`;
}

function bindBrandSection(app, merchant) {
  app.root.querySelectorAll("[data-order-material]").forEach(button => button.addEventListener("click", () => openBrandMaterialOrder(app, merchant, button.dataset.orderMaterial)));
  app.root.querySelectorAll("[data-reorder-material]").forEach(button => button.addEventListener("click", () => {
    const previous = app.repos.brandMaterials.order(button.dataset.reorderMaterial);
    if (previous) openBrandMaterialOrder(app, merchant, previous.itemCode, previous);
  }));
}

function openBrandMaterialOrder(app, merchant, itemCode, previous = null) {
  const item = BRAND_MATERIALS.find(entry => entry.code === itemCode);
  if (!item) return;
  const verified = merchant.compliance?.status === "compliant" && merchant.qualitySummary?.signal === "healthy" && merchant.qualityWorkflow?.status === "healthy";
  if (item.verifiedOnly && !verified) {
    app.toast("Verified materials are not currently available for this store.", { tone: "warning", title: "Order not available" });
    return;
  }
  app.openDialog(`
    <div class="dialog-inner material-order-dialog">
      <div class="dialog-head"><div><span class="eyebrow">Yagoya company merchandise</span><h2>Order ${escapeHtml(item.name)}</h2></div><button class="icon-btn" data-close-dialog aria-label="Close">✕</button></div>
      <p class="muted">${escapeHtml(item.description)}</p>
      <form id="brandMaterialOrderForm" class="form-grid">
        <label class="field">Type<select id="materialVariant">${item.variants.map(variant => `<option ${previous?.variant === variant ? "selected" : ""}>${escapeHtml(variant)}</option>`).join("")}</select></label>
        <label class="field">Quantity<input id="materialQuantity" type="number" min="1" max="100" value="${previous?.quantity || 1}" required /></label>
        <label class="field">Fulfilment<select id="materialFulfilment"><option value="deliver" ${previous?.fulfilment !== "collect" ? "selected" : ""}>Deliver to store</option><option value="collect" ${previous?.fulfilment === "collect" ? "selected" : ""}>Collect from Yagoya</option></select></label>
        <label class="field full" id="materialAddressField">Delivery address<input id="materialAddress" value="${escapeHtml(previous?.deliveryAddress || merchant.address || "")}" /></label>
        <label class="field full">Order note<textarea id="materialNote" rows="3" placeholder="Optional sizes, event date or special instructions">${escapeHtml(previous?.note || "")}</textarea></label>
        <div class="notice field full"><strong>Order review:</strong> Yagoya fulfilment will confirm stock, final specification and any applicable pricing before fulfilment.</div>
        <button class="btn primary field full" type="submit">Place order</button>
      </form>
    </div>`);
  const fulfilment = app.dialog.querySelector("#materialFulfilment");
  const addressField = app.dialog.querySelector("#materialAddressField");
  const syncAddress = () => { addressField.hidden = fulfilment.value === "collect"; };
  fulfilment.addEventListener("change", syncAddress); syncAddress();
  app.dialog.querySelector("#brandMaterialOrderForm").addEventListener("submit", event => {
    event.preventDefault();
    const actor = { id: merchant.id, role: "merchant", name: merchant.name };
    const result = app.commands.orderBrandMaterial({
      merchantId: merchant.id,
      itemCode: item.code,
      itemName: item.name,
      variant: app.dialog.querySelector("#materialVariant").value,
      quantity: Number(app.dialog.querySelector("#materialQuantity").value),
      fulfilment: fulfilment.value,
      deliveryAddress: fulfilment.value === "deliver" ? app.dialog.querySelector("#materialAddress").value.trim() : "Yagoya collection",
      note: app.dialog.querySelector("#materialNote").value.trim()
    }, actor);
    app.closeDialog();
    app.toast(`${result.itemName} × ${result.quantity} submitted to Yagoya.`, { title: "Material order placed" });
    app.render();
  });
}

function settingsSection(merchant) {
  return `
    <section class="section-head"><div><h2>Store Settings</h2><p>Store operations and Yagoya storefront tools.</p></div></section>
    <section class="section grid grid-2 merchant-settings-grid">
      <div class="card">
        <div class="section-head"><div><h3>Operating settings</h3><p>Save the values used for ordering and delivery.</p></div></div>
        <form id="merchantSettingsForm" class="form-grid">
          <label class="field">Preparation time (minutes)<input id="merchantPrep" type="number" min="1" max="180" value="${Number(merchant.prepMinutes || 20)}" required /></label>
          <label class="field">Minimum order (R)<input id="merchantMinimum" type="number" min="0" step="0.01" value="${(Number(merchant.minOrderCents || 0) / 100).toFixed(2)}" required /></label>
          <label class="field">Delivery fee (R)<input id="merchantDeliveryFee" type="number" min="0" step="0.01" value="${(Number(merchant.deliveryFeeCents || 0) / 100).toFixed(2)}" required /></label>
          <label class="field">Delivery radius (km)<input id="merchantRadius" type="number" min="0" max="100" step="0.5" value="${Number(merchant.delivery?.radiusKm || 0)}" required /></label>
          <button class="btn primary field full" type="submit">Save store settings</button>
        </form>
      </div>
      <div class="card">
        <span class="eyebrow">Store identity</span><h3>${escapeHtml(merchant.name)}</h3>
        <div class="summary-line"><span>Address</span><strong>${escapeHtml(merchant.address || "Not set")}</strong></div>
        <div class="summary-line"><span>Area</span><strong>${escapeHtml(merchant.area || "—")}</strong></div>
        <p class="muted small">Address/location changes affect directions and delivery geometry, so Yagoya reviews them before the stored coordinates change.</p>
        <button class="btn ghost small" id="requestLocationChangeButton">Request location change</button>
      </div>
      <div class="card action-card"><div><strong>Storefront QR</strong><div class="muted small">Print a QR code that opens this store directly in Yagoya.</div></div><button class="btn primary small" id="merchantQrButton">View QR</button></div>
      <div class="card action-card"><div><strong>Settlement</strong><div class="muted small">${escapeHtml(merchant.settlement?.status || "not configured")}</div></div><button class="btn ghost small" id="bankingButton">${merchant.settlement?.status === "verified" ? "Update" : "Set up"}</button></div>
    </section>`;
}

function bindSettingsSection(app, merchant) {
  app.root.querySelector("#merchantSettingsForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const actor = { id: merchant.id, role: "merchant", name: merchant.name };
    app.commands.merchantUpdateStore(merchant.id, {
      prepMinutes: Number(app.root.querySelector("#merchantPrep").value),
      minOrderCents: toCents(app.root.querySelector("#merchantMinimum").value),
      deliveryFeeCents: toCents(app.root.querySelector("#merchantDeliveryFee").value),
      delivery: { radiusKm: Number(app.root.querySelector("#merchantRadius").value) }
    }, actor);
    app.toast("Preparation, minimum order and delivery settings have been saved.", { title: "Store settings saved" });
    app.render();
  });
  app.root.querySelector("#requestLocationChangeButton")?.addEventListener("click", () => openMerchantSupport(app, merchant, { subject: "Store location change", message: `Please update the store location currently listed as: ${merchant.address || "Not set"}.` }));
  app.root.querySelector("#bankingButton")?.addEventListener("click", () => openBanking(app, merchant));
  app.root.querySelector("#merchantQrButton")?.addEventListener("click", () => openMerchantQr(app, merchant));
}

function supportSection(cases) {
  const open = cases.filter(item => ["open", "in_progress"].includes(item.status)).length;
  return `
    <section class="section-head"><div><h2>Support</h2><p>Contact Yagoya and track merchant support cases.</p></div><button class="btn primary" id="merchantSupportButton">New support request</button></section>
    <div class="metric-strip"><div class="stat"><span class="muted">Open cases</span><b>${open}</b></div><div class="stat"><span class="muted">Total cases</span><b>${cases.length}</b></div></div>
    <section class="section">${merchantSupportTable(cases)}</section>`;
}

function bindSupportSection(app, merchant) {
  app.root.querySelector("#merchantSupportButton")?.addEventListener("click", () => openMerchantSupport(app, merchant));
}

function merchantSupportTable(cases) {
  if (!cases.length) return '<div class="empty">No support cases yet.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead><tbody>${cases.map(item => `<tr><td><strong>${escapeHtml(item.subject)}</strong><div class="muted small">${escapeHtml(item.message)}</div></td><td><span class="badge ${item.priority === "high" ? "danger" : "info"}">${escapeHtml(item.priority)}</span></td><td><span class="badge ${item.status === "resolved" ? "ok" : "warn"}">${escapeHtml(item.status.replaceAll("_", " "))}</span></td><td>${formatDateTime(item.updatedAt || item.createdAt)}</td></tr>`).join("")}</tbody></table></div>`;
}

function ordersTable(app, orders) {
  if (!orders.length) return '<div class="empty">No orders in this view.</div>';
  return `<table>
    <thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Next step</th></tr></thead>
    <tbody>${orders.map(order => {
      const task = app.repos.delivery.taskForOrder(order.id);
      return `<tr>
        <td><button class="order-link" data-open-order="${order.id}">${escapeHtml(order.orderNumber || order.id)}</button><div class="muted small">${escapeHtml(order.customer)}${order.scheduledFor ? ` · Scheduled ${formatDateTime(order.scheduledFor)}` : ""}</div></td>
        <td><strong>${money(order.amountCents)}</strong><div class="muted small">${task ? "Delivery" : "Pickup"}</div></td>
        <td><span class="badge ${order.status === "completed" ? "ok" : "info"}">${escapeHtml(order.status)}</span>${task ? `<div class="muted small" style="margin-top:5px">${escapeHtml(deliveryStatusLabel(task.status))}</div>` : ""}</td>
        <td><div class="row-actions"><button class="btn ghost small" data-open-order="${order.id}">Open</button>${orderActionButton(order, task)}</div></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function orderActionButton(order, task) {
  if (order.status === "pending") return `<button class="btn primary small" data-order-id="${order.id}" data-order-status="accepted">Accept</button>`;
  if (order.status === "accepted") return `<button class="btn primary small" data-order-id="${order.id}" data-order-status="ready">Mark ready</button>`;
  if (order.status === "ready" && !task) return `<button class="btn primary small" data-order-id="${order.id}" data-order-status="completed">Complete pickup</button>`;
  return "";
}

function orderStatusConfirmation(status) {
  if (status === "accepted") return ["Order accepted", "The order is now in preparation."];
  if (status === "ready") return ["Order marked ready", "The customer/delivery flow can now continue."];
  if (status === "completed") return ["Pickup completed", "The order has been completed."];
  return ["Order updated", `Order status changed to ${status}.`];
}

function bindOrderActions(app, root) {
  root.querySelectorAll("[data-order-status]").forEach(button => {
    button.addEventListener("click", () => {
      const status = button.dataset.orderStatus;
      app.commands.merchantOrderTransition({ orderId: button.dataset.orderId, status, merchantId: app.currentMerchantId });
      app.closeDialog();
      const [title, detail] = orderStatusConfirmation(status);
      app.toast(detail, { title });
      app.render();
    });
  });
}

function openOrderDetails(app, orderId) {
  const order = app.repos.orders.get(orderId);
  if (!order) return;
  const merchant = app.repos.merchants.get(order.merchantId);
  const task = app.repos.delivery.taskForOrder(order.id);
  const driver = task?.assignedDriverId ? app.repos.delivery.driver(task.assignedDriverId) : null;
  const deliveryEvents = task ? app.repos.delivery.events(task.id, { limit: 50, direction: "desc" }).items : [];

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head">
        <div><div class="order-meta"><span class="eyebrow">Order ${escapeHtml(order.orderNumber || order.id)}</span><span class="badge ${order.paymentStatus === "paid" ? "ok" : "warn"}">${escapeHtml(order.paymentStatus)}</span></div><h2 style="margin:6px 0 0">${escapeHtml(merchant?.name || "Order details")}</h2></div>
        <button class="icon-btn" data-close-dialog>✕</button>
      </div>
      <div class="order-summary"><div class="summary-line"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div><div class="summary-line"><span>Fulfilment</span><strong>${task ? "Home delivery" : "Pickup"}</strong></div>${order.scheduledFor ? `<div class="summary-line"><span>Requested for</span><strong>${formatDateTime(order.scheduledFor)}</strong></div>` : ""}${task ? `<div class="summary-line"><span>Delivery</span><strong>${escapeHtml(deliveryStatusLabel(task.status))}</strong></div>` : ""}</div>
      <div class="detail-section"><h3>Items</h3><div class="order-items">${order.items.map(item => `<div class="order-item"><div><strong>${item.qty} × ${escapeHtml(item.name)}</strong><div class="muted small">${money(item.priceCents)} each</div></div><strong>${money(item.qty * item.priceCents)}</strong></div>`).join("")}</div>${Number(order.discountCents || 0) > 0 ? `<div class="summary-line"><span>Promotion ${escapeHtml(order.promoCode || "")}</span><strong>−${money(order.discountCents)}</strong></div>` : ""}${Number(order.deliveryFeeCents || 0) > 0 ? `<div class="summary-line"><span>Delivery</span><strong>${money(order.deliveryFeeCents)}</strong></div>` : ""}${Number(order.tipCents || 0) > 0 ? `<div class="summary-line"><span>Tip</span><strong>${money(order.tipCents)}</strong></div>` : ""}<div class="summary-line total"><span>Total paid</span><strong>${money(order.amountCents)}</strong></div></div>
      <div class="detail-section"><h3>Customer</h3><div class="summary-line"><span>Name</span><strong>${escapeHtml(order.customer)}</strong></div>${order.phone ? `<div class="summary-line"><span>Phone</span><strong>${escapeHtml(order.phone)}</strong></div>` : ""}${task?.dropoff?.address ? `<div class="summary-line"><span>Deliver to</span><strong>${escapeHtml(task.dropoff.address)}</strong></div>` : ""}${order.notes ? `<div class="notice" style="margin-top:10px"><strong>Order note</strong><div class="small" style="margin-top:4px">${escapeHtml(order.notes)}</div></div>` : ""}</div>
      ${task ? `<div class="detail-section"><h3>Delivery</h3><div class="summary-line"><span>Current status</span><strong>${escapeHtml(deliveryStatusLabel(task.status))}</strong></div>${driver ? `<div class="summary-line"><span>Driver</span><strong>${escapeHtml(driver.name)}</strong></div>` : '<div class="summary-line"><span>Driver</span><strong>Not assigned yet</strong></div>'}</div>` : ""}
      <details class="details-disclosure"><summary>More details</summary><div style="margin-top:10px"><div class="summary-line"><span>Placed</span><strong>${formatDateTime(order.createdAt)}</strong></div>${order.email ? `<div class="summary-line"><span>Email</span><strong>${escapeHtml(order.email)}</strong></div>` : ""}${order.paymentId ? `<div class="summary-line"><span>Payment reference</span><strong>${escapeHtml(order.paymentId)}</strong></div>` : ""}${deliveryEvents.length ? `<div style="margin-top:12px"><strong class="small">Delivery events</strong><div class="timeline" style="margin-top:10px">${deliveryEvents.map(event => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(event.message)}</strong><div class="muted small">${formatDateTime(event.createdAt)}</div></div></div>`).join("")}</div></div>` : ""}</div></details>
      ${orderActionButton(order, task) ? `<div class="detail-section"><div class="inline-actions">${orderActionButton(order, task)}</div></div>` : ""}
    </div>`);
  bindOrderActions(app, app.dialog);
}

function catalogueTable(products) {
  if (!products.length) return '<div class="empty">No menu items yet.</div>';
  return `<table><thead><tr><th>Item</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${products.map(product => `<tr><td><div class="catalogue-item-cell">${product.imageUrl ? `<img class="catalogue-thumb" src="${escapeHtml(product.imageUrl)}" alt="" />` : `<span class="catalogue-emoji">${product.emoji || "🥪"}</span>`}<div><strong>${escapeHtml(product.name)}</strong><div class="muted small">${escapeHtml(product.category)}</div></div></div></td><td>${money(product.priceCents)}</td><td><span class="badge ${product.enabled ? "ok" : "danger"}">${product.enabled ? "Visible" : "Hidden"}</span></td><td><button class="btn ghost small" data-edit-product="${product.id}">Edit</button></td></tr>`).join("")}</tbody></table>`;
}

function openMerchantSupport(app, merchant, preset = {}) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><div><span class="eyebrow">Yagoya support</span><h2>How can we help?</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="merchantSupportForm" class="form-grid">
        <label class="field full">Subject<input id="supportSubject" required placeholder="Short description" value="${escapeHtml(preset.subject || "")}" /></label>
        <label class="field">Priority<select id="supportPriority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
        <label class="field full">What do you need?<textarea id="supportMessage" rows="5" required>${escapeHtml(preset.message || "")}</textarea></label>
        <button class="btn primary field full">Send to Yagoya</button>
      </form>
    </div>`);
  app.dialog.querySelector("#merchantSupportForm").addEventListener("submit", event => {
    event.preventDefault();
    app.commands.createSupportCase({ source: "merchant", merchantId: merchant.id, sourceId: merchant.id, sourceName: merchant.name, subject: app.dialog.querySelector("#supportSubject").value, message: app.dialog.querySelector("#supportMessage").value, priority: app.dialog.querySelector("#supportPriority").value }, { id: merchant.id, role: "merchant", name: merchant.name });
    app.closeDialog(); app.toast("Your request has been sent and is now visible in Support.", { title: "Support request sent" }); app.render();
  });
}

function openBanking(app, merchant) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Settlement details</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="bankingForm" class="form-grid">
        <label class="field">Account holder<input id="bankHolder" value="${escapeHtml(merchant.legalName)}" required /></label>
        <label class="field">Bank<select id="bankName"><option>Merchant Bank</option><option>Other SA Bank</option></select></label>
        <label class="field">Account number<input id="bankAccount" inputmode="numeric" required /></label>
        <label class="field">Branch code<input id="branchCode" inputmode="numeric" required /></label>
        <div class="notice field full"><strong>Review before saving:</strong> Settlement changes affect where merchant funds are paid. Yagoya will verify the submitted details before activation.</div>
        <button class="btn primary field full">Submit for verification</button>
      </form>
    </div>`);

  app.dialog.querySelector("#bankingForm").addEventListener("submit", event => {
    event.preventDefault();
    const account = app.dialog.querySelector("#bankAccount").value;
    app.commands.saveSettlement(merchant.id, { bankName: app.dialog.querySelector("#bankName").value, accountHolder: app.dialog.querySelector("#bankHolder").value.trim(), maskedAccount: maskBankAccount(account), status: "pending_verification" }, { id: merchant.gatewayAccount?.id || uid("subaccount"), status: "pending" }, { id: merchant.id, role: "merchant", name: merchant.name }, "Merchant submitted settlement details");
    app.closeDialog(); app.toast("Settlement details were saved and submitted to Yagoya for verification.", { title: "Settlement details submitted" }); app.render();
  });
}

function openProduct(app, merchant, productId = null) {
  const product = productId ? app.repos.products.get(productId) : null;
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>${product ? "Edit" : "Add"} menu item</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="productForm" class="form-grid">
        <label class="field">Item name<input id="productName" value="${escapeHtml(product?.name || "")}" required /></label>
        <label class="field">Price (R)<input id="productPrice" type="number" min="1" step="0.01" value="${product ? (product.priceCents / 100).toFixed(2) : ""}" required /></label>
        <label class="field">Category<input id="productCategory" value="${escapeHtml(product?.category || "Kotas")}" /></label>
        <label class="field">Emoji<input id="productEmoji" value="${escapeHtml(product?.emoji || "🥪")}" maxlength="4" /></label>
        <label class="field full">Photo URL<input id="productImage" type="url" value="${escapeHtml(product?.imageUrl || "")}" placeholder="https://…" /></label>
        <label class="field full">Description<textarea id="productDescription" rows="3">${escapeHtml(product?.desc || "")}</textarea></label>
        ${product ? `<label class="field full inline-check"><input id="productEnabled" type="checkbox" ${product.enabled !== false ? "checked" : ""} /> Visible to customers</label>` : ""}
        <button class="btn primary field full">Save item</button>
      </form>
    </div>`);

  app.dialog.querySelector("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = { merchantId: merchant.id, name: app.dialog.querySelector("#productName").value.trim(), priceCents: toCents(app.dialog.querySelector("#productPrice").value), category: app.dialog.querySelector("#productCategory").value.trim() || "Other", desc: app.dialog.querySelector("#productDescription").value.trim(), emoji: app.dialog.querySelector("#productEmoji").value || "🥪", imageUrl: app.dialog.querySelector("#productImage").value.trim(), enabled: product ? app.dialog.querySelector("#productEnabled").checked : true };
    const actor = { id: merchant.id, role: "merchant", name: merchant.name };
    if (product) app.commands.updateProduct(product.id, merchant.id, data, actor);
    else app.commands.addProduct({ id: uid("product"), ...data }, actor);
    app.closeDialog(); app.toast(product ? `${data.name} has been updated.` : `${data.name} has been added to the menu.`, { title: product ? "Menu item saved" : "Menu item added" }); app.render();
  });
}

function openMerchantQr(app, merchant) {
  const url = merchantStorefrontUrl(merchant.id);
  const image = qrImageUrl(url, 320);
  app.openDialog(`
    <div class="dialog-inner qr-print-card">
      <div class="dialog-head"><div><span class="eyebrow">Storefront QR</span><h2>${escapeHtml(merchant.name)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="qr-panel"><img class="merchant-qr-image" src="${image}" alt="QR code for ${escapeHtml(merchant.name)}" /><div><strong>Scan to order from this merchant</strong><p class="muted small">The code opens ${escapeHtml(merchant.name)} directly inside Yagoya.</p><code class="qr-url">${escapeHtml(url)}</code></div></div>
      <div class="inline-actions" style="margin-top:16px"><button class="btn primary" id="printQrButton">Print QR</button><button class="btn ghost" id="copyQrLink">Copy link</button></div>
    </div>`);
  app.dialog.querySelector("#printQrButton")?.addEventListener("click", () => {
    document.body.classList.add("qr-print-mode"); window.print(); window.setTimeout(() => document.body.classList.remove("qr-print-mode"), 300);
  });
  app.dialog.querySelector("#copyQrLink")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); app.toast("The storefront link is ready to paste.", { title: "Storefront link copied" }); }
    catch { app.toast("Copy the storefront link shown with the QR.", { tone: "warning", title: "Clipboard unavailable" }); }
  });
}
