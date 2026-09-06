import { escapeHtml, money, uid } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";
import { deliveryStatusLabel } from "../services/delivery-service.js";
import { maskBankAccount } from "../services/payment-service.js";

export function renderMerchantView(app) {
  const merchants = app.store.state.merchants;
  if (!app.demoMerchantId || !app.store.merchant(app.demoMerchantId)) app.demoMerchantId = merchants[0]?.id;
  const merchant = app.store.merchant(app.demoMerchantId);
  const outlets = app.store.state.outlets.filter(outlet => outlet.merchantId === merchant.id);
  const orders = app.store.state.orders.filter(order => order.merchantId === merchant.id);
  const products = app.store.state.products.filter(product => product.merchantId === merchant.id);
  const paidRevenue = orders.filter(order => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amount, 0);
  const activeDeliveries = orders.filter(order => {
    const task = app.store.deliveryTaskForOrder(order.id);
    return task && !["delivered", "cancelled"].includes(task.status);
  }).length;

  app.root.innerHTML = `
    <section class="section-head">
      <div><span class="eyebrow">Merchant workspace</span><h2>${escapeHtml(merchant.name)}</h2><p>Orders, outlets, catalogue, quality, delivery hand-off and settlement onboarding.</p></div>
      <select id="merchantSwitcher" class="btn ghost">
        ${merchants.map(item => `<option value="${item.id}" ${item.id === merchant.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select>
    </section>

    <div class="grid grid-4">
      <div class="stat"><span class="muted">Paid order value</span><b>${money(paidRevenue)}</b></div>
      <div class="stat"><span class="muted">Orders</span><b>${orders.length}</b></div>
      <div class="stat"><span class="muted">Active deliveries</span><b>${activeDeliveries}</b></div>
      <div class="stat"><span class="muted">Settlement</span><b style="font-size:1rem">${escapeHtml(merchant.settlement.status)}</b></div>
    </div>

    <section class="section grid grid-3">
      <div class="card">
        <div class="section-head"><div><h3>Direct settlement</h3><p>GoodKota configures the gateway. You provide accurate merchant/KYC and banking information.</p></div></div>
        <div class="summary-line"><span>Gateway account</span><strong>${escapeHtml(merchant.gatewayAccount?.status || "not configured")}</strong></div>
        <div class="summary-line"><span>Bank</span><strong>${escapeHtml(merchant.settlement.bankName || "Not supplied")}</strong></div>
        <div class="summary-line"><span>Account</span><strong>${escapeHtml(merchant.settlement.maskedAccount || "Not supplied")}</strong></div>
        <div class="summary-line"><span>Food proceeds</span><strong>Direct to merchant</strong></div>
        <div class="summary-line"><span>Delivery fee</span><strong>Provider-specific allocation</strong></div>
        <button class="btn dark" id="bankingButton" style="margin-top:10px">${merchant.settlement.status === "verified" ? "Update settlement details" : "Complete settlement onboarding"}</button>
      </div>
      <div class="card">
        <div class="section-head"><div><h3>Delivery hand-off</h3><p>The merchant prepares the food; delivery is a separate operational task.</p></div></div>
        <div class="summary-line"><span>Own drivers</span><strong>${merchant.deliveryCapability?.ownDrivers ? "Supported" : "No"}</strong></div>
        <div class="summary-line"><span>GoodKota fleet</span><strong>${merchant.deliveryCapability?.acceptsGoodKotaFleet ? "Allowed" : "Disabled"}</strong></div>
        <div class="summary-line"><span>Third-party adapters</span><strong>${merchant.deliveryCapability?.thirdPartyAllowed ? "Future-ready" : "Disabled"}</strong></div>
        <p class="muted small">When a delivery order is marked ready, the delivery task becomes dispatchable. Merchants do not need to manage GoodKota drivers themselves.</p>
      </div>
      <div class="card">
        <div class="section-head"><div><h3>GoodKota Standard</h3><p>Quality remains operational, not decorative.</p></div></div>
        ${outlets.map(outlet => {
          const badge = qualityBadge(outlet.qualityWorkflow.status, outlet.qualitySummary.signal);
          return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
            <div class="outlet-title"><strong>${escapeHtml(outlet.name)}</strong><span class="badge ${badge.tone}">${badge.label}</span></div>
            <div class="rating-line"><span>⭐</span><strong>${outlet.qualitySummary.overall.toFixed(1)}</strong><span class="muted small">Food ${outlet.qualitySummary.food.toFixed(1)} · Service ${outlet.qualitySummary.service.toFixed(1)}</span></div>
          </div>`;
        }).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Orders</h3><p>Payment is confirmed first. Delivery orders hand off to the delivery domain when the food is ready.</p></div></div>
      <div class="table-wrap">${ordersTable(app, orders)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Catalogue</h3><p>Products belong to the merchant and can be offered at one or more outlets.</p></div><button class="btn dark" id="addProductButton">+ Add menu item</button></div>
      <div class="table-wrap">${catalogueTable(app, products)}</div>
    </section>`;

  app.root.querySelector("#merchantSwitcher").addEventListener("change", event => {
    app.demoMerchantId = event.currentTarget.value;
    app.render();
  });
  app.root.querySelector("#bankingButton").addEventListener("click", () => openBanking(app, merchant));
  app.root.querySelector("#addProductButton").addEventListener("click", () => openProduct(app, merchant, outlets));
  app.root.querySelectorAll("[data-order-status]").forEach(button => {
    button.addEventListener("click", () => {
      app.store.updateOrderStatus(button.dataset.orderId, button.dataset.orderStatus);
      app.render();
    });
  });
}

function ordersTable(app, orders) {
  if (!orders.length) return '<div class="empty">No orders yet.</div>';
  return `<table><thead><tr><th>Order</th><th>Outlet</th><th>Fulfilment</th><th>Amount</th><th>Payment</th><th>Kitchen</th><th>Delivery</th><th>Action</th></tr></thead><tbody>${orders.map(order => {
    const outlet = app.store.outlet(order.outletId);
    const task = app.store.deliveryTaskForOrder(order.id);
    return `<tr>
      <td><strong>${order.id}</strong><div class="muted small">${escapeHtml(order.customer)}</div></td>
      <td>${escapeHtml(outlet?.name || "")}</td>
      <td><span class="badge ${task ? "info" : ""}">${task ? "Delivery" : "Pickup"}</span></td>
      <td>${money(order.amount)}</td>
      <td><span class="badge ${order.paymentStatus === "paid" ? "ok" : "warn"}">${escapeHtml(order.paymentStatus)}</span></td>
      <td><span class="badge info">${escapeHtml(order.status)}</span></td>
      <td>${task ? `<span class="badge dark">${escapeHtml(deliveryStatusLabel(task.status))}</span>` : '<span class="muted small">—</span>'}</td>
      <td>${orderActions(order, task)}</td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

function orderActions(order, task) {
  if (order.status === "pending") return `<button class="btn ok small" data-order-id="${order.id}" data-order-status="accepted">Accept</button>`;
  if (order.status === "accepted") return `<button class="btn small" data-order-id="${order.id}" data-order-status="ready">Mark ready</button>`;
  if (order.status === "ready" && task) return '<span class="muted small">Ready for dispatch</span>';
  if (order.status === "ready" && !task) return `<button class="btn ok small" data-order-id="${order.id}" data-order-status="completed">Complete pickup</button>`;
  if (order.status === "out_for_delivery") return '<span class="muted small">With driver</span>';
  return '<span class="muted small">No action</span>';
}

function catalogueTable(app, products) {
  if (!products.length) return '<div class="empty">No menu items yet.</div>';
  return `<table><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Outlets</th><th>Status</th></tr></thead><tbody>${products.map(product => `<tr>
    <td>${product.emoji || "🥪"} <strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.category)}</td><td>${money(product.price)}</td>
    <td>${product.outletIds.map(id => escapeHtml(app.store.outlet(id)?.name || id)).join("<br>")}</td><td><span class="badge ${product.enabled ? "ok" : "danger"}">${product.enabled ? "Enabled" : "Disabled"}</span></td>
  </tr>`).join("")}</tbody></table>`;
}

function openBanking(app, merchant) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Settlement onboarding</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="notice info">GoodKota controls the gateway integration. In production these details should be handed to the payment provider for verification/tokenisation rather than stored raw by GoodKota.</div>
      <form id="bankingForm" class="form-grid" style="margin-top:14px">
        <label class="field">Account holder<input id="bankHolder" value="${escapeHtml(merchant.legalName)}" required /></label>
        <label class="field">Bank<select id="bankName"><option>Demo Bank</option><option>Other SA Bank</option></select></label>
        <label class="field">Account number<input id="bankAccount" inputmode="numeric" placeholder="Enter account number" required /></label>
        <label class="field">Branch code<input id="branchCode" inputmode="numeric" placeholder="000000" required /></label>
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
    app.toast("Settlement details captured and marked pending verification. Raw account number was not persisted by this demo.");
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
        <button class="btn primary field full">Save menu item</button>
      </form>
    </div>`);

  app.dialog.querySelector("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    const outletIds = [...app.dialog.querySelectorAll('[name="productOutlet"]:checked')].map(input => input.value);
    if (!outletIds.length) return alert("Select at least one outlet.");
    app.store.addProduct({
      id: uid("product"), merchantId: merchant.id, outletIds,
      name: app.dialog.querySelector("#productName").value.trim(),
      price: Number(app.dialog.querySelector("#productPrice").value),
      category: app.dialog.querySelector("#productCategory").value.trim() || "Other",
      desc: app.dialog.querySelector("#productDescription").value.trim(),
      emoji: app.dialog.querySelector("#productEmoji").value || "🥪", enabled: true
    });
    app.closeDialog();
    app.toast("Menu item added.");
    app.render();
  });
}
