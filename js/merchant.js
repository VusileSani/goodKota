import { nextOrderStatus, transitionOrder } from "./domain/orderLifecycle.js";
import { createId, escapeHtml, formatTime, money, statusTone, titleCase } from "./helpers.js";
import { getState, updateState } from "./store.js";

let merchantId = null;

function selectedMerchant() {
  const state = getState();
  if (!state.merchants.length) return null;
  if (!state.merchants.some(merchant => merchant.id === merchantId)) merchantId = state.merchants[0].id;
  return state.merchants.find(merchant => merchant.id === merchantId) || null;
}

export function renderMerchant() {
  renderMerchantSelector();
  const merchant = selectedMerchant();
  if (!merchant) return;
  renderMerchantIdentity(merchant);
  renderMerchantStats(merchant);
  renderMerchantOrders(merchant);
  renderCatalogue(merchant);
}

function renderMerchantSelector() {
  const select = document.getElementById("merchantWorkspaceSelect");
  const merchants = getState().merchants;
  if (!merchants.length) {
    select.innerHTML = "";
    return;
  }
  if (!merchants.some(merchant => merchant.id === merchantId)) merchantId = merchants[0].id;
  select.innerHTML = merchants.map(merchant => `
    <option value="${merchant.id}" ${merchant.id === merchantId ? "selected" : ""}>${escapeHtml(merchant.name)}</option>
  `).join("");
}

function renderMerchantIdentity(merchant) {
  const plan = getState().subscriptionPlans.find(plan => plan.id === merchant.subscriptionPlanId);
  document.getElementById("merchantIdentityCard").innerHTML = `
    <div class="merchant-identity">
      <div>
        <span class="eyebrow">${escapeHtml(merchant.location)}</span>
        <h2>${escapeHtml(merchant.name)}</h2>
        <div class="inline-meta">
          <span class="pill ${merchant.platformStatus === "ACTIVE" ? "success" : "danger"}">Platform ${titleCase(merchant.platformStatus)}</span>
          <span class="pill ${merchant.isOpen ? "success" : "danger"}">${merchant.isOpen ? "Store open" : "Store closed"}</span>
        </div>
      </div>
      <div class="merchant-control">
        <button class="button ${merchant.isOpen ? "danger" : "success"}" data-toggle-store="${merchant.id}">
          ${merchant.isOpen ? "Close store" : "Open store"}
        </button>
      </div>
    </div>
    <div class="subscription-strip">
      <span><strong>Subscription:</strong> ${escapeHtml(plan?.name || "Unassigned")}</span>
      <span class="pill ${statusTone(merchant.subscriptionStatus)}">${titleCase(merchant.subscriptionStatus)}</span>
    </div>
  `;

  document.querySelector("[data-toggle-store]")?.addEventListener("click", () => {
    updateState(state => {
      const target = state.merchants.find(item => item.id === merchant.id);
      if (target) target.isOpen = !target.isOpen;
    });
  });
}

function renderMerchantStats(merchant) {
  const orders = getState().orders.filter(order => order.merchantId === merchant.id);
  const completed = orders.filter(order => order.status === "COMPLETED");
  const revenue = completed.reduce((sum, order) => sum + Number(order.pricing.total || 0), 0);
  const live = orders.filter(order => !["COMPLETED", "REJECTED", "CANCELLED"].includes(order.status)).length;
  const pending = orders.filter(order => order.status === "PENDING").length;
  const average = completed.length ? revenue / completed.length : 0;

  document.getElementById("merchantStats").innerHTML = [
    ["Completed sales", money(revenue)],
    ["Orders", String(orders.length)],
    ["Live orders", String(live)],
    ["Average completed order", money(average)]
  ].map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`).join("");

  if (pending > 0) {
    document.getElementById("merchantStats").children[2].querySelector("span").textContent = `Live orders · ${pending} pending`;
  }
}

function renderMerchantOrders(merchant) {
  const orders = getState().orders
    .filter(order => order.merchantId === merchant.id)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  document.getElementById("merchantOrders").innerHTML = orders.length
    ? orders.map(order => {
      const nextStatus = nextOrderStatus(order);
      const itemText = order.items.map(item => `${item.quantity} × ${escapeHtml(item.name)}`).join(" · ");
      return `
        <article class="order-card">
          <div class="order-head">
            <div>
              <h3>${escapeHtml(order.id)} · ${escapeHtml(order.customer.name)}</h3>
              <div class="inline-meta">
                <span>${formatTime(order.createdAt)}</span>
                <span>•</span>
                <span>${titleCase(order.fulfilmentType)}</span>
                <span>•</span>
                <span>${money(order.pricing.total)}</span>
              </div>
            </div>
            <span class="pill ${statusTone(order.status)}">${titleCase(order.status)}</span>
          </div>
          <div class="order-body">
            <div class="order-items">
              <strong>Items:</strong> ${itemText || "—"}<br />
              ${order.notes ? `<strong>Notes:</strong> ${escapeHtml(order.notes)}` : ""}
              ${order.deliveryAddress ? `<br /><strong>Deliver to:</strong> ${escapeHtml(order.deliveryAddress)}` : ""}
            </div>
            <div class="order-actions">
              ${order.status === "PENDING" ? `<button class="button danger small" data-order-action="REJECTED" data-order-id="${order.id}">Reject</button>` : ""}
              ${nextStatus ? `<button class="button ${nextStatus === "COMPLETED" ? "success" : "dark"} small" data-order-action="${nextStatus}" data-order-id="${order.id}">${actionLabel(nextStatus)}</button>` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state"><strong>No orders for this merchant.</strong>New customer orders will appear here.</div>`;

  document.querySelectorAll("[data-order-action]").forEach(button => {
    button.addEventListener("click", () => changeOrderStatus(button.dataset.orderId, button.dataset.orderAction));
  });
}

function actionLabel(status) {
  return ({
    ACCEPTED: "Accept order",
    PREPARING: "Start preparing",
    READY: "Mark ready",
    DISPATCHED: "Mark dispatched",
    COMPLETED: "Complete order"
  })[status] || titleCase(status);
}

function changeOrderStatus(orderId, nextStatus) {
  updateState(state => {
    const index = state.orders.findIndex(order => order.id === orderId);
    if (index < 0) return;
    state.orders[index] = transitionOrder(state.orders[index], nextStatus);
  });
}

function renderCatalogue(merchant) {
  const items = getState().menuItems.filter(item => item.merchantId === merchant.id);
  document.getElementById("merchantCatalogue").innerHTML = items.length
    ? `
      <table>
        <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.emoji || "🥪")} ${escapeHtml(item.name)}</strong><div class="muted">${escapeHtml(item.description)}</div></td>
              <td>${escapeHtml(item.category)}</td>
              <td>${money(item.unitPrice)}</td>
              <td><span class="pill ${item.enabled ? "success" : "danger"}">${item.enabled ? "Enabled" : "Disabled"}</span></td>
              <td><button class="button small" data-toggle-item="${item.id}">${item.enabled ? "Disable" : "Enable"}</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<div class="empty-state"><strong>No menu items yet.</strong>Add the merchant's first item.</div>`;

  document.querySelectorAll("[data-toggle-item]").forEach(button => {
    button.addEventListener("click", () => {
      updateState(state => {
        const item = state.menuItems.find(entry => entry.id === button.dataset.toggleItem);
        if (item) item.enabled = !item.enabled;
      });
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function saveMenuItem() {
  const merchant = selectedMerchant();
  if (!merchant) return;
  const name = document.getElementById("menuItemName").value.trim();
  const unitPrice = Number(document.getElementById("menuItemPrice").value);
  const category = document.getElementById("menuItemCategory").value.trim() || "Other";
  const emoji = document.getElementById("menuItemEmoji").value.trim() || "🥪";
  const description = document.getElementById("menuItemDescription").value.trim();

  if (!name || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    alert("Item name and a valid price are required.");
    return;
  }

  updateState(state => {
    state.menuItems.push({
      id: createId("ITEM"),
      merchantId: merchant.id,
      name,
      category,
      description,
      unitPrice,
      emoji,
      enabled: true
    });
  });

  ["menuItemName", "menuItemPrice", "menuItemDescription"].forEach(id => {
    document.getElementById(id).value = "";
  });
  closeModal("menuItemModal");
}

export function bindMerchantEvents() {
  document.getElementById("merchantWorkspaceSelect").addEventListener("change", event => {
    merchantId = event.target.value;
    renderMerchant();
  });
  document.getElementById("addMenuItemButton").addEventListener("click", () => openModal("menuItemModal"));
  document.getElementById("saveMenuItemButton").addEventListener("click", saveMenuItem);
}
