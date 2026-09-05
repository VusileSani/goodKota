import { CUSTOMER_ORDER_LIMIT, DEFAULT_CUSTOMER_NAME, FULFILMENT, PLATFORM_STATUS } from "./config.js";
import { calculatePricing } from "./domain/pricing.js";
import { orderProgress } from "./domain/orderLifecycle.js";
import { createId, escapeHtml, formatDateTime, money, statusTone, titleCase } from "./helpers.js";
import { getState, updateState } from "./store.js";

let currentMerchantId = null;
let category = "All";
let fulfilmentType = FULFILMENT.COLLECTION;
let cart = [];

function merchantById(id) {
  return getState().merchants.find(merchant => merchant.id === id) || null;
}

function menuItemById(id) {
  return getState().menuItems.find(item => item.id === id) || null;
}

function activeMerchants() {
  return getState().merchants.filter(merchant => merchant.platformStatus === PLATFORM_STATUS.ACTIVE);
}

function ensureMerchant() {
  const merchants = activeMerchants();
  if (!merchants.length) {
    currentMerchantId = null;
    return null;
  }
  if (!merchants.some(merchant => merchant.id === currentMerchantId)) {
    currentMerchantId = merchants[0].id;
  }
  return merchantById(currentMerchantId);
}

function cartItemSnapshots() {
  return cart.map(line => {
    const item = menuItemById(line.menuItemId);
    return {
      menuItemId: item.id,
      name: item.name,
      unitPrice: Number(item.unitPrice),
      quantity: Number(line.quantity)
    };
  });
}

function currentPromo() {
  const code = document.getElementById("promoCode")?.value.trim().toUpperCase();
  if (!code) return null;
  return getState().promotions.find(promo => promo.code === code) || null;
}

function pricing(tipPercent = 0) {
  const merchant = merchantById(currentMerchantId);
  const deliveryFee = fulfilmentType === FULFILMENT.DELIVERY ? merchant?.deliveryFee || 0 : 0;
  return calculatePricing({
    items: cartItemSnapshots(),
    deliveryFee,
    promo: currentPromo(),
    tipPercent
  });
}

export function renderCustomer() {
  renderMerchantCards();
  renderStorefront();
  renderCustomerOrders();
}

function renderMerchantCards() {
  const location = document.getElementById("customerLocation").value.trim().toLowerCase();
  const merchants = activeMerchants().filter(merchant => {
    if (!location) return true;
    return `${merchant.name} ${merchant.location}`.toLowerCase().includes(location);
  });

  document.getElementById("merchantCount").textContent = `${merchants.length} store${merchants.length === 1 ? "" : "s"}`;
  document.getElementById("merchantCards").innerHTML = merchants.length
    ? merchants.map(merchant => `
      <article class="merchant-card ${merchant.id === currentMerchantId ? "selected" : ""}">
        <span class="pill ${merchant.isOpen ? "success" : "danger"}">${merchant.isOpen ? "Open" : "Closed"}</span>
        <h3>${escapeHtml(merchant.name)}</h3>
        <p class="muted">${escapeHtml(merchant.shortDescription)}</p>
        <div class="merchant-meta">
          <span>${escapeHtml(merchant.location)}</span>
          <span>•</span>
          <span>~${merchant.prepMinutes} min</span>
          <span>•</span>
          <span>${merchant.fulfilmentModes.includes("DELIVERY") ? "Delivery available" : "Collection only"}</span>
        </div>
        <button class="button ${merchant.id === currentMerchantId ? "dark" : "primary"}" data-select-merchant="${merchant.id}">
          ${merchant.id === currentMerchantId ? "Viewing store" : "View menu"}
        </button>
      </article>
    `).join("")
    : `<div class="empty-state" style="grid-column:1/-1"><strong>No demo stores match that area.</strong>Try Midrand, Tembisa or Centurion.</div>`;

  document.querySelectorAll("[data-select-merchant]").forEach(button => {
    button.addEventListener("click", () => selectMerchant(button.dataset.selectMerchant));
  });
}

function selectMerchant(merchantId) {
  if (currentMerchantId !== merchantId && cart.length) {
    const change = confirm("Switching stores will clear the current cart. Continue?");
    if (!change) return;
    cart = [];
  }

  currentMerchantId = merchantId;
  category = "All";
  const merchant = merchantById(merchantId);
  fulfilmentType = merchant?.fulfilmentModes.includes(FULFILMENT.COLLECTION)
    ? FULFILMENT.COLLECTION
    : FULFILMENT.DELIVERY;
  document.getElementById("menuSearch").value = "";
  renderCustomer();
  document.getElementById("storefrontSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStorefront() {
  const merchant = ensureMerchant();
  if (!merchant) {
    document.getElementById("storefrontHeader").innerHTML = `<div class="empty-state">No active merchants.</div>`;
    document.getElementById("menuGrid").innerHTML = "";
    return;
  }

  if (!merchant.fulfilmentModes.includes(fulfilmentType)) {
    fulfilmentType = merchant.fulfilmentModes[0] || FULFILMENT.COLLECTION;
  }

  document.getElementById("storefrontHeader").innerHTML = `
    <div class="store-title-row">
      <div>
        <span class="eyebrow">${escapeHtml(merchant.location)}</span>
        <h2 style="margin:5px 0 4px">${escapeHtml(merchant.name)}</h2>
        <p class="muted" style="margin:0">${escapeHtml(merchant.shortDescription)}</p>
      </div>
      <strong>${merchant.isOpen ? "Taking orders" : "Currently closed"}</strong>
    </div>
    <div class="storefront-status">
      <span class="pill ${merchant.isOpen ? "success" : "danger"}">${merchant.isOpen ? "Open" : "Closed"}</span>
      <span class="pill">~${merchant.prepMinutes} min preparation</span>
      <span class="pill">Min ${money(merchant.minimumOrder)}</span>
      ${merchant.fulfilmentModes.includes("DELIVERY") ? `<span class="pill">Delivery ${money(merchant.deliveryFee)}</span>` : `<span class="pill">Collection only</span>`}
    </div>
  `;

  renderFulfilmentSelector(merchant);
  renderMenu(merchant);
  renderCart(merchant);
}

function renderFulfilmentSelector(merchant) {
  document.querySelectorAll("[data-fulfilment]").forEach(button => {
    const mode = button.dataset.fulfilment;
    const supported = merchant.fulfilmentModes.includes(mode);
    button.disabled = !supported;
    button.classList.toggle("active", mode === fulfilmentType);
  });
}

function renderMenu(merchant) {
  const available = getState().menuItems.filter(item => item.merchantId === merchant.id && item.enabled);
  const categories = ["All", ...new Set(available.map(item => item.category))];
  if (!categories.includes(category)) category = "All";

  document.getElementById("categoryChips").innerHTML = categories.map(name => `
    <button class="chip ${name === category ? "active" : ""}" data-category="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");

  document.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
      category = button.dataset.category;
      renderStorefront();
    });
  });

  const query = document.getElementById("menuSearch").value.trim().toLowerCase();
  const filtered = available.filter(item => {
    const categoryMatch = category === "All" || item.category === category;
    const queryMatch = !query || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(query);
    return categoryMatch && queryMatch;
  });

  document.getElementById("menuGrid").innerHTML = filtered.length
    ? filtered.map(item => `
      <article class="menu-card">
        <div class="menu-art">${escapeHtml(item.emoji || "🥪")}</div>
        <div class="menu-body">
          <span class="pill">${escapeHtml(item.category)}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="muted">${escapeHtml(item.description)}</p>
          <div class="menu-footer">
            <span class="price">${money(item.unitPrice)}</span>
            <button class="button primary small" data-add-item="${item.id}" ${merchant.isOpen ? "" : "disabled"}>Add</button>
          </div>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state" style="grid-column:1/-1"><strong>No menu items found.</strong>Try another category or search term.</div>`;

  document.querySelectorAll("[data-add-item]").forEach(button => {
    button.addEventListener("click", () => addToCart(button.dataset.addItem));
  });
}

function addToCart(menuItemId) {
  const existing = cart.find(line => line.menuItemId === menuItemId);
  if (existing) existing.quantity += 1;
  else cart.push({ menuItemId, quantity: 1 });
  renderStorefront();
}

function changeQuantity(menuItemId, delta) {
  const line = cart.find(item => item.menuItemId === menuItemId);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity <= 0) cart = cart.filter(item => item.menuItemId !== menuItemId);
  renderStorefront();
}

function renderCart(merchant) {
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  document.getElementById("cartCount").textContent = `${count} item${count === 1 ? "" : "s"}`;

  document.getElementById("cartLines").innerHTML = cart.length
    ? cart.map(line => {
      const item = menuItemById(line.menuItemId);
      return `
        <div class="cart-line">
          <div>
            <div class="cart-line-title">${escapeHtml(item.name)}</div>
            <div class="cart-line-meta">${money(item.unitPrice)} each</div>
            <div class="qty-control">
              <button data-qty-item="${item.id}" data-qty-delta="-1">−</button>
              <strong>${line.quantity}</strong>
              <button data-qty-item="${item.id}" data-qty-delta="1">+</button>
            </div>
          </div>
          <strong>${money(item.unitPrice * line.quantity)}</strong>
        </div>
      `;
    }).join("")
    : `<div class="empty-state"><strong>Your cart is empty.</strong>Add something good.</div>`;

  document.querySelectorAll("[data-qty-item]").forEach(button => {
    button.addEventListener("click", () => changeQuantity(button.dataset.qtyItem, Number(button.dataset.qtyDelta)));
  });

  const totals = calculatePricing({
    items: cartItemSnapshots(),
    deliveryFee: fulfilmentType === FULFILMENT.DELIVERY ? merchant.deliveryFee : 0
  });

  document.getElementById("cartTotals").innerHTML = `
    <div class="total-row"><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>
    <div class="total-row"><span>Delivery</span><strong>${money(totals.deliveryFee)}</strong></div>
    <div class="total-row grand"><span>Total</span><strong>${money(totals.total)}</strong></div>
  `;

  const checkoutButton = document.getElementById("checkoutButton");
  checkoutButton.disabled = !cart.length || !merchant.isOpen || totals.subtotal < Number(merchant.minimumOrder || 0);
  checkoutButton.title = !merchant.isOpen
    ? "Store is closed"
    : totals.subtotal < Number(merchant.minimumOrder || 0)
      ? `Minimum order is ${money(merchant.minimumOrder)}`
      : "";
}

function renderCustomerOrders() {
  const orders = getState().orders
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, CUSTOMER_ORDER_LIMIT);

  document.getElementById("customerOrders").innerHTML = orders.length
    ? orders.map(order => {
      const progress = orderProgress(order);
      return `
        <article class="order-card">
          <div class="order-head">
            <div>
              <h3>${escapeHtml(order.id)}</h3>
              <div class="inline-meta">
                <span>${escapeHtml(order.merchantNameSnapshot)}</span>
                <span>•</span>
                <span>${formatDateTime(order.createdAt)}</span>
                <span>•</span>
                <span>${titleCase(order.fulfilmentType)}</span>
              </div>
            </div>
            <div style="text-align:right">
              <span class="pill ${statusTone(order.status)}">${titleCase(order.status)}</span>
              <div style="margin-top:6px;font-weight:950">${money(order.pricing.total)}</div>
            </div>
          </div>
          <div class="timeline">
            ${order.status === "REJECTED"
              ? `<span class="timeline-step current">Rejected</span>`
              : progress.map(step => `<span class="timeline-step ${step.current ? "current" : ""}" style="opacity:${step.reached ? 1 : .45}">${titleCase(step.status)}</span>`).join("")}
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state"><strong>No orders yet.</strong>Your placed orders will appear here.</div>`;
}

function openCheckout() {
  const merchant = merchantById(currentMerchantId);
  if (!merchant || !cart.length) return;
  document.getElementById("deliveryAddressField").classList.toggle("hidden", fulfilmentType !== FULFILMENT.DELIVERY);
  updateCheckoutSummary();
  openModal("checkoutModal");
}

function updateCheckoutSummary() {
  const tipPercent = Number(document.getElementById("tipPercent").value || 0);
  const totals = pricing(tipPercent);
  const enteredCode = document.getElementById("promoCode").value.trim();

  document.getElementById("checkoutSummary").innerHTML = `
    <div class="total-row"><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>
    <div class="total-row"><span>Delivery</span><strong>${money(totals.deliveryFee)}</strong></div>
    <div class="total-row"><span>Discount</span><strong>−${money(totals.discount)}</strong></div>
    <div class="total-row"><span>Tip</span><strong>${money(totals.tip)}</strong></div>
    <div class="total-row grand"><span>Total</span><strong>${money(totals.total)}</strong></div>
    ${enteredCode && !totals.promoCode ? `<p class="muted" style="margin:8px 0 0">Promo is invalid, disabled or below its minimum spend.</p>` : ""}
  `;
}

function placeOrder() {
  const merchant = merchantById(currentMerchantId);
  if (!merchant || !merchant.isOpen || !cart.length) return;

  const name = document.getElementById("checkoutName").value.trim();
  const phone = document.getElementById("checkoutPhone").value.trim();
  const timing = document.getElementById("orderTiming").value;
  const scheduledAt = document.getElementById("scheduledAt").value || null;
  const deliveryAddress = document.getElementById("deliveryAddress").value.trim() || null;
  const notes = document.getElementById("orderNotes").value.trim();
  const tipPercent = Number(document.getElementById("tipPercent").value || 0);
  const orderPricing = pricing(tipPercent);

  if (!name || !phone) {
    alert("Name and mobile number are required.");
    return;
  }
  if (fulfilmentType === FULFILMENT.DELIVERY && !deliveryAddress) {
    alert("Please enter a delivery address.");
    return;
  }
  if (timing === "SCHEDULED" && !scheduledAt) {
    alert("Please choose the scheduled collection/delivery time.");
    return;
  }
  if (orderPricing.subtotal < merchant.minimumOrder) {
    alert(`Minimum order is ${money(merchant.minimumOrder)}.`);
    return;
  }

  const createdAt = new Date().toISOString();
  const order = {
    id: createId("GK"),
    merchantId: merchant.id,
    merchantNameSnapshot: merchant.name,
    customer: { name, phone },
    fulfilmentType,
    timing,
    scheduledAt,
    deliveryAddress,
    notes,
    items: cartItemSnapshots(),
    pricing: orderPricing,
    status: "PENDING",
    statusHistory: [{ status: "PENDING", at: createdAt }],
    createdAt
  };

  updateState(state => {
    state.orders.unshift(order);
  });

  cart = [];
  closeModal("checkoutModal");
  document.getElementById("promoCode").value = "";
  document.getElementById("tipPercent").value = "0";
  document.getElementById("orderNotes").value = "";
  document.getElementById("checkoutName").value = name || DEFAULT_CUSTOMER_NAME;
  alert(`Order ${order.id} placed successfully.`);
  renderCustomer();
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

export function bindCustomerEvents() {
  document.getElementById("findStoresButton").addEventListener("click", renderCustomer);
  document.getElementById("customerLocation").addEventListener("keydown", event => {
    if (event.key === "Enter") renderCustomer();
  });
  document.getElementById("menuSearch").addEventListener("input", () => renderStorefront());
  document.getElementById("checkoutButton").addEventListener("click", openCheckout);

  document.querySelectorAll("[data-fulfilment]").forEach(button => {
    button.addEventListener("click", () => {
      const merchant = merchantById(currentMerchantId);
      const mode = button.dataset.fulfilment;
      if (!merchant?.fulfilmentModes.includes(mode)) return;
      fulfilmentType = mode;
      renderStorefront();
    });
  });

  document.getElementById("orderTiming").addEventListener("change", event => {
    document.getElementById("scheduleField").classList.toggle("hidden", event.target.value !== "SCHEDULED");
  });
  document.getElementById("promoCode").addEventListener("input", updateCheckoutSummary);
  document.getElementById("tipPercent").addEventListener("change", updateCheckoutSummary);
  document.getElementById("placeOrderButton").addEventListener("click", placeOrder);

  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });
}
