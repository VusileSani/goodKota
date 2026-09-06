import { escapeHtml, formatDateTime, money, toCents, uid } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";
import { deliveryStatusLabel } from "../services/delivery-service.js";
import { maskBankAccount } from "../services/payment-service.js";

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
  const needsAction = orders.filter(order => ["pending", "accepted", "ready"].includes(order.status)).length;
  const activeDeliveries = orders.filter(order => {
    const task = app.repos.delivery.taskForOrder(order.id);
    return task && !["delivered", "cancelled"].includes(task.status);
  }).length;
  const quality = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);

  app.root.innerHTML = `
    <section class="section-head">
      <div><span class="eyebrow">Merchant</span><h2>${escapeHtml(merchant.name)}</h2><p>${escapeHtml(merchant.address || "")} · Orders and menu.</p></div>
      <select id="merchantSwitcher" class="btn ghost merchant-switcher">
        ${merchants.map(item => `<option value="${item.id}" ${item.id === merchant.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select>
    </section>

    <div class="metric-strip">
      <div class="stat"><span class="muted">Orders needing action</span><b>${needsAction}</b></div>
      <div class="stat"><span class="muted">Active deliveries</span><b>${activeDeliveries}</b></div>
      <div class="stat"><span class="muted">Quality</span><b style="font-size:1rem"><span class="badge ${quality.tone}">${quality.label}</span></b></div>
    </div>

    <section class="section">
      <div class="section-head"><div><h3>Orders</h3><p>Open any order to see the full detail.</p></div></div>
      <div class="table-wrap">${ordersTable(app, orders)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Menu</h3><p>${products.length} ${products.length === 1 ? "item" : "items"}</p></div><button class="btn primary" id="addProductButton">+ Add item</button></div>
      <div class="table-wrap">${catalogueTable(products)}</div>
    </section>

    <section class="section grid grid-3">
      <div class="card action-card">
        <div><strong>Settlement</strong><div class="muted small">${escapeHtml(merchant.settlement?.status || "not configured")}</div></div>
        <button class="btn ghost small" id="bankingButton">${merchant.settlement?.status === "verified" ? "Update" : "Set up"}</button>
      </div>
      <div class="card">
        <strong>GoodKota Standard</strong>
        <div class="summary-line"><span>Verified ratings</span><strong>${merchant.qualitySummary.count}</strong></div>
        <div class="summary-line"><span>Overall</span><strong>${merchant.qualitySummary.overall.toFixed(1)}</strong></div>
        <div class="summary-line"><span>Status</span><span class="badge ${quality.tone}">${quality.label}</span></div>
      </div>
      <div class="card action-card">
        <div><strong>GoodKota support</strong><div class="muted small">${escapeHtml(merchant.commercial?.plan || "Standard")} · ${escapeHtml(merchant.commercial?.status || "active")}</div></div>
        <button class="btn ghost small" id="merchantSupportButton">Get help</button>
      </div>
    </section>`;

  app.root.querySelector("#merchantSwitcher").addEventListener("change", event => {
    app.currentMerchantId = event.currentTarget.value;
    app.render();
  });
  app.root.querySelector("#bankingButton").addEventListener("click", () => openBanking(app, merchant));
  app.root.querySelector("#addProductButton").addEventListener("click", () => openProduct(app, merchant));
  app.root.querySelector("#merchantSupportButton").addEventListener("click", () => openMerchantSupport(app, merchant));

  bindOrderActions(app, app.root);
  app.root.querySelectorAll("[data-open-order]").forEach(button => {
    button.addEventListener("click", () => openOrderDetails(app, button.dataset.openOrder));
  });
}

function ordersTable(app, orders) {
  if (!orders.length) return '<div class="empty">No orders yet.</div>';
  return `<table>
    <thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Next step</th></tr></thead>
    <tbody>${orders.map(order => {
      const task = app.repos.delivery.taskForOrder(order.id);
      return `<tr>
        <td><button class="order-link" data-open-order="${order.id}">${escapeHtml(order.orderNumber || order.id)}</button><div class="muted small">${escapeHtml(order.customer)}</div></td>
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

function bindOrderActions(app, root) {
  root.querySelectorAll("[data-order-status]").forEach(button => {
    button.addEventListener("click", () => {
      app.commands.merchantOrderTransition({ orderId: button.dataset.orderId, status: button.dataset.orderStatus, merchantId: app.currentMerchantId });
      app.closeDialog();
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
        <div>
          <div class="order-meta"><span class="eyebrow">Order ${escapeHtml(order.orderNumber || order.id)}</span><span class="badge ${order.paymentStatus === "paid" ? "ok" : "warn"}">${escapeHtml(order.paymentStatus)}</span></div>
          <h2 style="margin:6px 0 0">${escapeHtml(merchant?.name || "Order details")}</h2>
        </div>
        <button class="icon-btn" data-close-dialog>✕</button>
      </div>

      <div class="order-summary">
        <div class="summary-line"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
        <div class="summary-line"><span>Fulfilment</span><strong>${task ? "Home delivery" : "Pickup"}</strong></div>
        ${task ? `<div class="summary-line"><span>Delivery</span><strong>${escapeHtml(deliveryStatusLabel(task.status))}</strong></div>` : ""}
      </div>

      <div class="detail-section">
        <h3>Items</h3>
        <div class="order-items">
          ${order.items.map(item => `<div class="order-item"><div><strong>${item.qty} × ${escapeHtml(item.name)}</strong><div class="muted small">${money(item.priceCents)} each</div></div><strong>${money(item.qty * item.priceCentsCents)}</strong></div>`).join("")}
        </div>
        ${Number(order.deliveryFeeCents || 0) > 0 ? `<div class="summary-line"><span>Delivery</span><strong>${money(order.deliveryFeeCents)}</strong></div>` : ""}
        <div class="summary-line total"><span>Total paid</span><strong>${money(order.amountCents)}</strong></div>
      </div>

      <div class="detail-section">
        <h3>Customer</h3>
        <div class="summary-line"><span>Name</span><strong>${escapeHtml(order.customer)}</strong></div>
        ${order.phone ? `<div class="summary-line"><span>Phone</span><strong>${escapeHtml(order.phone)}</strong></div>` : ""}
        ${task?.dropoff?.address ? `<div class="summary-line"><span>Deliver to</span><strong>${escapeHtml(task.dropoff.address)}</strong></div>` : ""}
        ${order.notes ? `<div class="notice" style="margin-top:10px"><strong>Order note</strong><div class="small" style="margin-top:4px">${escapeHtml(order.notes)}</div></div>` : ""}
      </div>

      ${task ? `<div class="detail-section">
        <h3>Delivery</h3>
        <div class="summary-line"><span>Current status</span><strong>${escapeHtml(deliveryStatusLabel(task.status))}</strong></div>
        ${driver ? `<div class="summary-line"><span>Driver</span><strong>${escapeHtml(driver.name)}</strong></div>` : '<div class="summary-line"><span>Driver</span><strong>Not assigned yet</strong></div>'}
      </div>` : ""}

      <details class="details-disclosure">
        <summary>More details</summary>
        <div style="margin-top:10px">
          <div class="summary-line"><span>Placed</span><strong>${formatDateTime(order.createdAt)}</strong></div>
          ${order.email ? `<div class="summary-line"><span>Email</span><strong>${escapeHtml(order.email)}</strong></div>` : ""}
          ${order.paymentId ? `<div class="summary-line"><span>Payment reference</span><strong>${escapeHtml(order.paymentId)}</strong></div>` : ""}
          ${deliveryEvents.length ? `<div style="margin-top:12px"><strong class="small">Delivery events</strong><div class="timeline" style="margin-top:10px">${deliveryEvents.map(event => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(event.message)}</strong><div class="muted small">${formatDateTime(event.createdAt)}</div></div></div>`).join("")}</div></div>` : ""}
        </div>
      </details>

      ${orderActionButton(order, task) ? `<div class="detail-section"><div class="inline-actions">${orderActionButton(order, task)}</div></div>` : ""}
    </div>`);

  bindOrderActions(app, app.dialog);
}

function catalogueTable(products) {
  if (!products.length) return '<div class="empty">No menu items yet.</div>';
  return `<table><thead><tr><th>Item</th><th>Price</th><th>Status</th></tr></thead><tbody>${products.map(product => `<tr>
    <td>${product.emoji || "🥪"} <strong>${escapeHtml(product.name)}</strong><div class="muted small">${escapeHtml(product.category)}</div></td>
    <td>${money(product.priceCents)}</td>
    <td><span class="badge ${product.enabled ? "ok" : "danger"}">${product.enabled ? "Enabled" : "Disabled"}</span></td>
  </tr>`).join("")}</tbody></table>`;
}

function openMerchantSupport(app, merchant) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><div><span class="eyebrow">GoodKota support</span><h2>How can we help?</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="merchantSupportForm" class="form-grid">
        <label class="field full">Subject<input id="supportSubject" required placeholder="Short description" /></label>
        <label class="field">Priority<select id="supportPriority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
        <label class="field full">What do you need?<textarea id="supportMessage" rows="5" required></textarea></label>
        <button class="btn primary field full">Send to GoodKota</button>
      </form>
    </div>`);
  app.dialog.querySelector("#merchantSupportForm").addEventListener("submit", event => {
    event.preventDefault();
    app.commands.createSupportCase({ source: "merchant", merchantId: merchant.id, sourceId: merchant.id, sourceName: merchant.name, subject: app.dialog.querySelector("#supportSubject").value, message: app.dialog.querySelector("#supportMessage").value, priority: app.dialog.querySelector("#supportPriority").value });
    app.closeDialog();
    app.toast("Support request sent to GoodKota.");
    app.render();
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
        <button class="btn primary field full">Submit for verification</button>
      </form>
    </div>`);

  app.dialog.querySelector("#bankingForm").addEventListener("submit", event => {
    event.preventDefault();
    const account = app.dialog.querySelector("#bankAccount").value;
    app.commands.saveSettlement(
      merchant.id,
      {
        bankName: app.dialog.querySelector("#bankName").value,
        accountHolder: app.dialog.querySelector("#bankHolder").value.trim(),
        maskedAccount: maskBankAccount(account),
        status: "pending_verification"
      },
      { id: merchant.gatewayAccount?.id || uid("subaccount"), status: "pending" },
      { id: merchant.id, role: "merchant", name: merchant.name },
      "Merchant submitted settlement details"
    );
    app.closeDialog();
    app.toast("Settlement details submitted for verification.");
    app.render();
  });
}

function openProduct(app, merchant) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Add menu item</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="productForm" class="form-grid">
        <label class="field">Item name<input id="productName" required /></label>
        <label class="field">Price (R)<input id="productPrice" type="number" min="1" step="0.01" required /></label>
        <label class="field">Category<input id="productCategory" value="Kotas" /></label>
        <label class="field">Emoji<input id="productEmoji" value="🥪" maxlength="4" /></label>
        <label class="field full">Description<textarea id="productDescription" rows="3"></textarea></label>
        <button class="btn primary field full">Save item</button>
      </form>
    </div>`);

  app.dialog.querySelector("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    app.commands.addProduct({
      id: uid("product"),
      merchantId: merchant.id,
      name: app.dialog.querySelector("#productName").value.trim(),
      priceCents: toCents(app.dialog.querySelector("#productPrice").value),
      category: app.dialog.querySelector("#productCategory").value.trim() || "Other",
      desc: app.dialog.querySelector("#productDescription").value.trim(),
      emoji: app.dialog.querySelector("#productEmoji").value || "🥪",
      enabled: true
    });
    app.closeDialog();
    app.toast("Menu item added.");
    app.render();
  });
}
