import { escapeHtml, formatDateTime, money, uid } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";
import { deliveryStatusLabel } from "../services/delivery-service.js";
import { maskBankAccount } from "../services/payment-service.js";

export function renderMerchantView(app) {
  const merchants = app.store.state.merchants;
  if (!merchants.length) {
    app.root.innerHTML = '<div class="empty">No merchants have been onboarded yet.</div>';
    return;
  }

  if (!app.demoMerchantId || !app.store.merchant(app.demoMerchantId)) app.demoMerchantId = merchants[0].id;
  const merchant = app.store.merchant(app.demoMerchantId);
  const outlets = app.store.state.outlets.filter(outlet => outlet.merchantId === merchant.id);
  const orders = app.store.state.orders.filter(order => order.merchantId === merchant.id);
  const products = app.store.state.products.filter(product => product.merchantId === merchant.id);
  const needsAction = orders.filter(order => ["pending", "accepted", "ready"].includes(order.status)).length;
  const activeDeliveries = orders.filter(order => {
    const task = app.store.deliveryTaskForOrder(order.id);
    return task && !["delivered", "cancelled"].includes(task.status);
  }).length;

  app.root.innerHTML = `
    <section class="section-head">
      <div><span class="eyebrow">Merchant</span><h2>${escapeHtml(merchant.name)}</h2><p>Orders and menu.</p></div>
      <select id="merchantSwitcher" class="btn ghost">
        ${merchants.map(item => `<option value="${item.id}" ${item.id === merchant.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select>
    </section>

    <div class="metric-strip">
      <div class="stat"><span class="muted">Orders needing action</span><b>${needsAction}</b></div>
      <div class="stat"><span class="muted">Active deliveries</span><b>${activeDeliveries}</b></div>
      <div class="stat"><span class="muted">Settlement</span><b style="font-size:1rem">${escapeHtml(merchant.settlement?.status || "not configured")}</b></div>
    </div>

    <section class="section">
      <div class="section-head"><div><h3>Orders</h3><p>Open any order to see the full detail.</p></div></div>
      <div class="table-wrap">${ordersTable(app, orders)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Menu</h3><p>${products.length} ${products.length === 1 ? "item" : "items"}</p></div><button class="btn primary" id="addProductButton">+ Add item</button></div>
      <div class="table-wrap">${catalogueTable(app, products)}</div>
    </section>

    <section class="section grid grid-2">
      <div class="card action-card">
        <div><strong>Settlement</strong><div class="muted small">${escapeHtml(merchant.settlement?.status || "not configured")}</div></div>
        <button class="btn ghost small" id="bankingButton">${merchant.settlement?.status === "verified" ? "Update" : "Set up"}</button>
      </div>
      <div class="card">
        <strong>Outlet quality</strong>
        <div style="margin-top:10px">${outlets.map(outlet => {
          const badge = qualityBadge(outlet.qualityWorkflow.status, outlet.qualitySummary.signal);
          return `<div class="summary-line"><span>${escapeHtml(outlet.name)}</span><span class="badge ${badge.tone}">${badge.label}</span></div>`;
        }).join("") || '<span class="muted small">No outlets.</span>'}</div>
      </div>
    </section>`;

  app.root.querySelector("#merchantSwitcher").addEventListener("change", event => {
    app.demoMerchantId = event.currentTarget.value;
    app.render();
  });
  app.root.querySelector("#bankingButton").addEventListener("click", () => openBanking(app, merchant));
  app.root.querySelector("#addProductButton").addEventListener("click", () => openProduct(app, merchant, outlets));

  bindOrderActions(app, app.root);
  app.root.querySelectorAll("[data-open-order]").forEach(button => {
    button.addEventListener("click", () => openOrderDetails(app, button.dataset.openOrder));
  });
}

function ordersTable(app, orders) {
  if (!orders.length) return '<div class="empty">No orders yet.</div>';
  return `<table>
    <thead><tr><th>Order</th><th>Outlet</th><th>Total</th><th>Status</th><th>Next step</th></tr></thead>
    <tbody>${orders.map(order => {
      const outlet = app.store.outlet(order.outletId);
      const task = app.store.deliveryTaskForOrder(order.id);
      return `<tr>
        <td><button class="order-link" data-open-order="${order.id}">${order.id}</button><div class="muted small">${escapeHtml(order.customer)}</div></td>
        <td>${escapeHtml(outlet?.name || "")}</td>
        <td><strong>${money(order.amount)}</strong><div class="muted small">${task ? "Delivery" : "Pickup"}</div></td>
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
      app.store.updateOrderStatus(button.dataset.orderId, button.dataset.orderStatus);
      app.closeDialog();
      app.render();
    });
  });
}

function openOrderDetails(app, orderId) {
  const order = app.store.order(orderId);
  if (!order) return;
  const outlet = app.store.outlet(order.outletId);
  const task = app.store.deliveryTaskForOrder(order.id);
  const driver = task?.assignedDriverId ? app.store.driver(task.assignedDriverId) : null;
  const deliveryEvents = task
    ? app.store.state.deliveryEvents.filter(event => event.taskId === task.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head">
        <div>
          <div class="order-meta"><span class="eyebrow">Order ${escapeHtml(order.id)}</span><span class="badge ${order.paymentStatus === "paid" ? "ok" : "warn"}">${escapeHtml(order.paymentStatus)}</span></div>
          <h2 style="margin:6px 0 0">${escapeHtml(outlet?.name || "Order details")}</h2>
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
          ${order.items.map(item => `<div class="order-item"><div><strong>${item.qty} × ${escapeHtml(item.name)}</strong><div class="muted small">${money(item.price)} each</div></div><strong>${money(item.qty * item.price)}</strong></div>`).join("")}
        </div>
        ${Number(order.deliveryFee || 0) > 0 ? `<div class="summary-line"><span>Delivery</span><strong>${money(order.deliveryFee)}</strong></div>` : ""}
        <div class="summary-line total"><span>Total paid</span><strong>${money(order.amount)}</strong></div>
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

function catalogueTable(app, products) {
  if (!products.length) return '<div class="empty">No menu items yet.</div>';
  return `<table><thead><tr><th>Item</th><th>Price</th><th>Available at</th><th>Status</th></tr></thead><tbody>${products.map(product => `<tr>
    <td>${product.emoji || "🥪"} <strong>${escapeHtml(product.name)}</strong><div class="muted small">${escapeHtml(product.category)}</div></td>
    <td>${money(product.price)}</td>
    <td>${product.outletIds.map(id => escapeHtml(app.store.outlet(id)?.name || id)).join("<br>")}</td>
    <td><span class="badge ${product.enabled ? "ok" : "danger"}">${product.enabled ? "Enabled" : "Disabled"}</span></td>
  </tr>`).join("")}</tbody></table>`;
}

function openBanking(app, merchant) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Settlement details</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="bankingForm" class="form-grid">
        <label class="field">Account holder<input id="bankHolder" value="${escapeHtml(merchant.legalName)}" required /></label>
        <label class="field">Bank<select id="bankName"><option>Demo Bank</option><option>Other SA Bank</option></select></label>
        <label class="field">Account number<input id="bankAccount" inputmode="numeric" required /></label>
        <label class="field">Branch code<input id="branchCode" inputmode="numeric" required /></label>
        <button class="btn primary field full">Submit for verification</button>
      </form>
    </div>`);

  app.dialog.querySelector("#bankingForm").addEventListener("submit", event => {
    event.preventDefault();
    const account = app.dialog.querySelector("#bankAccount").value;
    app.store.saveMerchantSettlement(
      merchant.id,
      {
        bankName: app.dialog.querySelector("#bankName").value,
        accountHolder: app.dialog.querySelector("#bankHolder").value.trim(),
        maskedAccount: maskBankAccount(account),
        status: "pending_verification"
      },
      { id: merchant.gatewayAccount?.id || uid("sub_demo"), status: "pending" }
    );
    app.closeDialog();
    app.toast("Settlement details submitted for verification.");
    app.render();
  });
}

function openProduct(app, merchant, outlets) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Add menu item</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="productForm" class="form-grid">
        <label class="field">Item name<input id="productName" required /></label>
        <label class="field">Price (R)<input id="productPrice" type="number" min="1" step="0.01" required /></label>
        <label class="field">Category<input id="productCategory" value="Kotas" /></label>
        <label class="field">Emoji<input id="productEmoji" value="🥪" maxlength="4" /></label>
        <label class="field full">Description<textarea id="productDescription" rows="3"></textarea></label>
        <div class="field full"><span>Available outlets</span>${outlets.map(outlet => `<label style="font-weight:500"><input type="checkbox" name="productOutlet" value="${outlet.id}" checked style="width:auto"> ${escapeHtml(outlet.name)}</label>`).join("")}</div>
        <button class="btn primary field full">Save item</button>
      </form>
    </div>`);

  app.dialog.querySelector("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    const outletIds = [...app.dialog.querySelectorAll('[name="productOutlet"]:checked')].map(input => input.value);
    if (!outletIds.length) return alert("Select at least one outlet.");
    app.store.addProduct({
      id: uid("product"),
      merchantId: merchant.id,
      outletIds,
      name: app.dialog.querySelector("#productName").value.trim(),
      price: Number(app.dialog.querySelector("#productPrice").value),
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
