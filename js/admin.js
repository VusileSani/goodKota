import { PLATFORM_STATUS, SUBSCRIPTION_STATUS } from "./config.js";
import { createId, escapeHtml, formatDateTime, money, slugify, statusTone, titleCase } from "./helpers.js";
import { getState, resetState, updateState } from "./store.js";

export function renderAdmin() {
  renderAdminStats();
  renderAdminMerchants();
  renderPromotions();
  renderPlans();
  renderAdminOrders();
  renderMerchantPlanOptions();
}

function renderAdminStats() {
  const state = getState();
  const completed = state.orders.filter(order => order.status === "COMPLETED");
  const grossOrderValue = completed.reduce((sum, order) => sum + Number(order.pricing.total || 0), 0);
  const liveOrders = state.orders.filter(order => !["COMPLETED", "REJECTED", "CANCELLED"].includes(order.status)).length;
  const activeMerchants = state.merchants.filter(merchant => merchant.platformStatus === PLATFORM_STATUS.ACTIVE).length;
  const subscriptionAttention = state.merchants.filter(merchant => [SUBSCRIPTION_STATUS.PAST_DUE, SUBSCRIPTION_STATUS.SUSPENDED].includes(merchant.subscriptionStatus)).length;

  document.getElementById("adminStats").innerHTML = [
    ["Completed order value", money(grossOrderValue)],
    ["Live orders", String(liveOrders)],
    ["Active merchants", String(activeMerchants)],
    ["Subscriptions needing attention", String(subscriptionAttention)]
  ].map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderAdminMerchants() {
  const state = getState();
  document.getElementById("adminMerchants").innerHTML = state.merchants.length
    ? `
      <table>
        <thead><tr><th>Merchant</th><th>Operations</th><th>Subscription</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.merchants.map(merchant => {
            const plan = state.subscriptionPlans.find(plan => plan.id === merchant.subscriptionPlanId);
            return `
              <tr>
                <td><strong>${escapeHtml(merchant.name)}</strong><div class="muted">${escapeHtml(merchant.location)}</div></td>
                <td>
                  <span class="pill ${merchant.platformStatus === "ACTIVE" ? "success" : "danger"}">${titleCase(merchant.platformStatus)}</span>
                  <span class="pill ${merchant.isOpen ? "success" : "danger"}">${merchant.isOpen ? "Open" : "Closed"}</span>
                </td>
                <td><strong>${escapeHtml(plan?.name || "Unassigned")}</strong><div style="margin-top:5px"><span class="pill ${statusTone(merchant.subscriptionStatus)}">${titleCase(merchant.subscriptionStatus)}</span></div></td>
                <td>${formatDateTime(merchant.joinedAt)}</td>
                <td>
                  <div class="table-actions">
                    <button class="button small" data-toggle-platform="${merchant.id}">${merchant.platformStatus === "ACTIVE" ? "Suspend" : "Activate"}</button>
                    <button class="button small" data-cycle-subscription="${merchant.id}">Cycle subscription</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `
    : `<div class="empty-state"><strong>No merchants.</strong>Add the first GoodKota merchant.</div>`;

  document.querySelectorAll("[data-toggle-platform]").forEach(button => {
    button.addEventListener("click", () => {
      updateState(state => {
        const merchant = state.merchants.find(item => item.id === button.dataset.togglePlatform);
        if (!merchant) return;
        merchant.platformStatus = merchant.platformStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        if (merchant.platformStatus === "SUSPENDED") merchant.isOpen = false;
      });
    });
  });

  document.querySelectorAll("[data-cycle-subscription]").forEach(button => {
    button.addEventListener("click", () => cycleSubscription(button.dataset.cycleSubscription));
  });
}

function cycleSubscription(merchantId) {
  const cycle = ["PILOT", "ACTIVE", "PAST_DUE", "SUSPENDED"];
  updateState(state => {
    const merchant = state.merchants.find(item => item.id === merchantId);
    if (!merchant) return;
    const current = cycle.indexOf(merchant.subscriptionStatus);
    merchant.subscriptionStatus = cycle[(current + 1) % cycle.length];
  });
}

function renderPromotions() {
  const promotions = getState().promotions;
  document.getElementById("adminPromos").innerHTML = promotions.length
    ? `
      <table>
        <thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${promotions.map(promo => `
            <tr>
              <td><strong>${escapeHtml(promo.code)}</strong></td>
              <td>${promo.discountPercent}%</td>
              <td>${money(promo.minimumSpend)}</td>
              <td><span class="pill ${statusTone(promo.status)}">${titleCase(promo.status)}</span></td>
              <td><button class="button small" data-toggle-promo="${promo.id}">${promo.status === "ACTIVE" ? "Disable" : "Enable"}</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<div class="empty-state">No promotions.</div>`;

  document.querySelectorAll("[data-toggle-promo]").forEach(button => {
    button.addEventListener("click", () => {
      updateState(state => {
        const promo = state.promotions.find(item => item.id === button.dataset.togglePromo);
        if (promo) promo.status = promo.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      });
    });
  });
}

function renderPlans() {
  const plans = getState().subscriptionPlans.filter(plan => plan.active);
  document.getElementById("subscriptionPlans").innerHTML = plans.map(plan => `
    <article class="plan-card">
      <span class="eyebrow">${plan.durationDays}-day cycle</span>
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="muted">${escapeHtml(plan.description)}</p>
      <strong>${plan.amount === null ? "Commercial pricing TBD" : money(plan.amount)}</strong>
    </article>
  `).join("");
}

function renderAdminOrders() {
  const orders = getState().orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById("adminOrders").innerHTML = orders.length
    ? `
      <table>
        <thead><tr><th>Order</th><th>Merchant</th><th>Customer</th><th>Fulfilment</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td><strong>${escapeHtml(order.id)}</strong><div class="muted">${formatDateTime(order.createdAt)}</div></td>
              <td>${escapeHtml(order.merchantNameSnapshot)}</td>
              <td>${escapeHtml(order.customer.name)}</td>
              <td>${titleCase(order.fulfilmentType)}</td>
              <td>${money(order.pricing.total)}</td>
              <td><span class="pill ${statusTone(order.status)}">${titleCase(order.status)}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<div class="empty-state">No orders yet.</div>`;
}

function renderMerchantPlanOptions() {
  const plans = getState().subscriptionPlans.filter(plan => plan.active);
  document.getElementById("merchantPlan").innerHTML = plans.map(plan => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`).join("");
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

function saveMerchant() {
  const name = document.getElementById("merchantName").value.trim();
  const location = document.getElementById("merchantLocation").value.trim();
  const prepMinutes = Number(document.getElementById("merchantPrep").value);
  const deliveryFee = Number(document.getElementById("merchantDeliveryFee").value);
  const minimumOrder = Number(document.getElementById("merchantMinimum").value);
  const subscriptionPlanId = document.getElementById("merchantPlan").value;

  if (!name || !location || !Number.isFinite(prepMinutes) || prepMinutes < 1) {
    alert("Store name, area and a valid preparation time are required.");
    return;
  }

  const joinedAt = new Date().toISOString();
  updateState(state => {
    state.merchants.push({
      id: createId("MER"),
      slug: slugify(name),
      name,
      location,
      shortDescription: "New GoodKota merchant.",
      prepMinutes,
      deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : 0,
      minimumOrder: Number.isFinite(minimumOrder) ? minimumOrder : 0,
      fulfilmentModes: ["COLLECTION", "DELIVERY"],
      isOpen: false,
      platformStatus: "ACTIVE",
      subscriptionPlanId,
      subscriptionStatus: "PILOT",
      joinedAt
    });
  });

  ["merchantName", "merchantLocation"].forEach(id => document.getElementById(id).value = "");
  closeModal("merchantModal");
}

function savePromo() {
  const code = document.getElementById("promoNewCode").value.trim().toUpperCase();
  const discountPercent = Number(document.getElementById("promoDiscount").value);
  const minimumSpend = Number(document.getElementById("promoMinimum").value);
  const status = document.getElementById("promoStatus").value;

  if (!code || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    alert("Promo code and a valid discount percentage are required.");
    return;
  }

  if (getState().promotions.some(promo => promo.code === code)) {
    alert("That promo code already exists.");
    return;
  }

  updateState(state => {
    state.promotions.push({
      id: createId("PROMO"),
      code,
      discountPercent,
      minimumSpend: Number.isFinite(minimumSpend) ? minimumSpend : 0,
      status
    });
  });

  document.getElementById("promoNewCode").value = "";
  closeModal("promoModal");
}

export function bindAdminEvents() {
  document.getElementById("addMerchantButton").addEventListener("click", () => openModal("merchantModal"));
  document.getElementById("saveMerchantButton").addEventListener("click", saveMerchant);
  document.getElementById("addPromoButton").addEventListener("click", () => openModal("promoModal"));
  document.getElementById("savePromoButton").addEventListener("click", savePromo);
  document.getElementById("resetDemoButton").addEventListener("click", () => {
    if (!confirm("Reset GoodKota demo data to the V1.0 seed?")) return;
    resetState();
  });
}
