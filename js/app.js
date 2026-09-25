import { Store } from "./core/store.js";
import { STANDARD } from "./data/seed.js";
import { canOrder, isPick, submitApplication, saveMerchant, transitionOrder, createCase } from "./core/operations.js";
import { buildPickupOrder } from "./core/checkout.js";
import { renderAdminWorkspace } from "./views/admin-view.js";

const store = new Store();
const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");
const roleSelect = document.querySelector("#roleSelect");
const locationLabel = document.querySelector("#locationLabel");

const money = cents => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
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
  roleSelect.value = store.state.role;
  locationLabel.textContent = store.state.location;
  if (store.state.role === "merchant") renderMerchant();
  else if (store.state.role === "admin") renderAdminWorkspace({store, app, modal, render, showToast, esc, money, directionsUrl, choiceText});
  else renderCustomer();
  bindCommon(app);
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
    return;
  }

  const tab = store.state.customerTab;
  app.innerHTML = tab === "saved" ? savedView() : tab === "orders" ? ordersView() : tab === "account" ? accountView() : discoverView();
  if (cartCount()) app.insertAdjacentHTML("beforeend", `<button class="cart-fab" data-cart aria-label="Open cart with ${cartCount()} items">Cart · ${cartCount()} <span>${money(cartTotal())}</span></button>`);
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
  app.querySelector("#findKota")?.addEventListener("click", () => app.querySelector("#merchantGrid")?.scrollIntoView({ behavior: "smooth" }));
  app.querySelector("#detailsForm")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    store.state.customerDetails = Object.fromEntries(new FormData(event.currentTarget));
    store.save();
    showToast("Details saved");
  });
  app.querySelector("#merchantApplication")?.addEventListener("click", openMerchantApplication);

  app.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    store.state.filter = button.dataset.filter;
    store.save();
    render();
  }));
}

function discoverView() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">The kota authority</div>
        <h1>Good kota.<br>Near you.</h1>
        <p>Find your next favourite kota spot.</p>
        <label class="searchbar">
          <input id="discoverSearch" type="search" placeholder="Search a kota spot or area" autocomplete="off" />
          <button class="btn primary" type="button" id="findKota">Find kota</button>
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Where the good kota is</h2><p>Explore kota spots near you.</p></div>
        <div class="filter-row">
          ${["All","Verified","Best value","Chicken"].map(filter => `<button class="chip ${store.state.filter === filter ? "active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}
        </div>
      </div>
      <div class="merchant-grid" id="merchantGrid">${merchantCards(filteredMerchants())}</div>
    </section>`;
}

function filteredMerchants() {
  const q = store.state.search.trim().toLowerCase();
  const filter = store.state.filter;
  return store.state.merchants
    .filter(m => m.listingStatus === "active")
    .filter(m => !q || `${m.name} ${m.area} ${m.tags.join(" ")}`.toLowerCase().includes(q))
    .filter(m => filter === "All" || (filter === "Verified" && standardPass(m)) || m.tags.includes(filter))
    .sort((a,b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

function updateMerchantGrid() {
  const grid = app.querySelector("#merchantGrid");
  if (!grid) return;
  grid.innerHTML = merchantCards(filteredMerchants());
  bindCommon(grid);
}

function merchantCards(merchants) {
  if (!merchants.length) return `<div class="empty">No kota spots match that search yet.</div>`;
  return merchants.map((m, index) => `
    <article class="merchant-card" data-open-merchant="${m.id}">
      <div class="merchant-card-top">
        <div class="merchant-monogram">${firstLetter(m.name)}</div>
        <button class="link-button" data-favourite="${m.id}" aria-label="${store.state.favourites.includes(m.id) ? "Remove favourite" : "Save favourite"}">${store.state.favourites.includes(m.id) ? "♥" : "♡"}</button>
      </div>
      <div class="merchant-photo" aria-hidden="true"><span>${esc(m.menu.find(item => item.available)?.emoji || "🥪")}</span><small>Food photo coming soon</small></div>
      <h3>${esc(m.name)}</h3>
      <div class="address"><a href="${directionsUrl(m)}" target="_blank" rel="noopener noreferrer" data-directions="${m.id}" aria-label="Navigate to ${esc(m.name)}">${esc(m.address || m.area)} ↗</a></div>
      <div class="merchant-facts">
        ${m.distanceKm != null ? `<span><strong>${m.distanceKm.toFixed(1)} km</strong></span>` : ""}
        ${m.rating != null ? `<span>★ ${m.rating.toFixed(1)}</span>` : ""}
        <span>~${m.prepMinutes} min</span>
        <span>${esc(m.priceBand)}</span>
        <span class="badge ${m.online ? "green" : "dark"}">${m.online ? "Open now" : "Closed"}</span>
      </div>
      <div class="card-bottom">
        ${standardPass(m) ? `<span class="badge orange">✓ GoodKota Pick</span>` : `<span class="badge amber">Under review</span>`}
        <button class="link-button" data-open-merchant="${m.id}">${index === 0 ? "Closest · " : ""}View menu →</button>
      </div>
    </article>`).join("");
}

function merchantDetail(merchant) {
  if (!merchant) return `<div class="empty">Merchant not found.</div>`;
  return `
    <section class="detail-hero">
      <button class="link-button back" id="backDiscover">← Back to nearby</button>
      <div class="eyebrow">${standardPass(merchant) ? "GoodKota Pick" : "Quality review"}</div>
      <h1>${esc(merchant.name)}</h1>
      <p>${esc(merchant.address || merchant.area)}${merchant.distanceKm != null ? ` · ${merchant.distanceKm.toFixed(1)} km away` : ""}${merchant.rating != null ? ` · ★ ${merchant.rating.toFixed(1)}` : ""}</p>
      <div class="detail-actions">
        <a class="btn primary" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer" data-directions="${merchant.id}">Get directions ↗</a>
        <button class="btn light" data-favourite="${merchant.id}">${store.state.favourites.includes(merchant.id) ? "♥ Saved" : "♡ Save"}</button>
        <button class="btn light" data-cart>Cart · ${cartCount()}</button>
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
  return `<div class="list-row"><div><strong>${esc(merchant?.name || "GoodKota")}</strong><p>${esc(order.id)} · ${esc(order.createdAt)} · Pay on collection</p><p>${order.items.map(line => `${line.qty} × ${esc(line.name || store.product(line.productId)?.name || "Item")}${choiceText(line) ? ` (${esc(choiceText(line))})` : ""}`).join(" · ")}</p>${order.cancelReason ? `<p>Cancelled: ${esc(order.cancelReason)}</p>` : ""}${merchant ? `<a class="text-link" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer" data-directions="${merchant.id}">Get directions ↗</a>` : ""}</div><div class="list-row-actions"><span class="badge ${tone}">${esc(order.status)}</span><strong>${money(order.total)}</strong></div></div>`;
}

function accountView() {
  const details = store.state.customerDetails;
  return `<div class="page-title"><div class="eyebrow">Account</div><h1>Your details</h1></div><section class="panel account-panel"><form id="detailsForm" class="checkout-fields">
    <label>First name<input name="firstName" autocomplete="given-name" required value="${esc(details.firstName)}"></label>
    <label>Last name<input name="lastName" autocomplete="family-name" value="${esc(details.lastName)}"></label>
    <label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(details.phone)}"></label>
    <label>Email address<input name="email" type="email" autocomplete="email" required value="${esc(details.email)}"></label>
    <button class="btn primary" type="submit">Save details</button>
  </form></section><section class="panel account-panel section"><h2>Own a kota spot?</h2><p class="muted">Tell us about your business and where customers can collect.</p><button class="btn ghost" id="merchantApplication">Apply to list your spot</button></section>`;
}

function openMerchantApplication() {
  modal.innerHTML = `<form class="modal-body editor-form" id="applyForm"><div class="modal-head"><div><div class="eyebrow">GoodKota merchants</div><h2>List your kota spot</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div>
    <div class="editor-pair"><label>Trading name<input name="businessName" required maxlength="80"></label><label>Area<input name="area" required maxlength="80"></label></div>
    <label>Pickup address<input name="address" required autocomplete="street-address" placeholder="Street address customers can navigate to"></label>
    <div class="editor-pair"><label>Contact name<input name="contactName" required autocomplete="name"></label><label>Mobile number<input name="phone" type="tel" required autocomplete="tel"></label></div>
    <label>Email<input name="email" type="email" required autocomplete="email"></label><label>About your spot<textarea name="note" rows="3" placeholder="What makes your kota special?"></textarea></label>
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
  return `<nav class="bottom-nav" aria-label="Customer navigation">${tabs.map(([id,icon,label]) => `<button class="${store.state.customerTab === id ? "active" : ""}" data-customer-tab="${id}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
}

// A choice is bound to one item. Store a price and label snapshot so later menu edits
// cannot silently change the price or contents of an order already placed.
const choicesFor = product => Array.isArray(product?.choices) ? product.choices : [];
const linePrice = line => line.unitPrice ?? store.product(line.productId)?.price ?? 0;
const choiceText = line => (line.choices || []).map(choice => choice.kind === "remove" ? `No ${choice.name}` : `Extra ${choice.name}`).join(" · ");

function addToCart(productId) {
  const product = store.product(productId);
  if (!product || !product.available || !canOrder(store.merchant(product.merchantId))) return;
  const choices = choicesFor(product);
  modal.innerHTML = `<form class="modal-body" id="optionsForm"><div class="modal-head"><div><div class="eyebrow">Make it yours</div><h2>${esc(product.name)}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p class="muted">${esc(product.desc)}</p><div class="choice-list">${choices.map(choice => `<label class="choice-row"><input type="checkbox" name="choice" value="${esc(choice.id)}" ${choice.available === false ? "disabled" : ""}><span><strong>${choice.kind === "remove" ? "No" : "Extra"} ${esc(choice.name)}</strong>${choice.available === false ? `<small>Unavailable</small>` : ""}</span><b>${choice.kind === "remove" ? "Included" : choice.price ? `+ ${money(choice.price)}` : "Free"}</b></label>`).join("") || `<p class="muted">No changes needed? Add it as it comes.</p>`}</div><div class="cart-total"><span>Total per item</span><span id="optionsTotal">${money(product.price)}</span></div><button class="btn primary wide" type="submit">Add to cart</button></form>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  const form = modal.querySelector("#optionsForm");
  const selected = () => choices.filter(choice => [...form.querySelectorAll('input[name="choice"]:checked')].some(input => input.value === choice.id));
  form.addEventListener("change", () => { form.querySelector("#optionsTotal").textContent = money(product.price + selected().reduce((sum, choice) => sum + choice.price, 0)); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const current = store.product(productId);
    if (!current?.available || !canOrder(store.merchant(current.merchantId))) { modal.close(); showToast("Item no longer available"); return; }
    const options = selected();
    const live = choicesFor(current);
    if (current.price !== product.price || options.some(option => !live.some(choice => choice.id === option.id && choice.available !== false && choice.price === option.price))) {
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
    else store.state.cart.push({productId, qty: 1, name: current.name, unitPrice: current.price + options.reduce((sum, choice) => sum + choice.price, 0), choices: options.map(({id,name,kind,price}) => ({id,name,kind,price}))});
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
    <label>First name<input name="firstName" autocomplete="given-name" required value="${esc(details.firstName)}"></label>
    <label>Last name<input name="lastName" autocomplete="family-name" value="${esc(details.lastName)}"></label>
    <label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(details.phone)}"></label>
    <label>Email address<input name="email" type="email" autocomplete="email" required value="${esc(details.email)}"></label>
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
    store.save(); modal.close(); openCart();
  }));
  modal.querySelector("#checkoutForm")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    placeOrder(Object.fromEntries(new FormData(event.currentTarget)));
  });
}

function placeOrder(details) {
  if (!store.state.cart.length) return;
  const product = store.product(store.state.cart[0].productId);
  const stale = store.state.cart.some(line => {
    const current = store.product(line.productId);
    const live = choicesFor(current);
    return !current?.available || current.merchantId !== product?.merchantId || (line.name && line.name !== current.name) || linePrice(line) !== current.price + (line.choices || []).reduce((sum, option) => sum + option.price, 0) || (line.choices || []).some(option => !live.some(choice => choice.id === option.id && choice.name === option.name && choice.kind === option.kind && choice.price === option.price && choice.available !== false));
  });
  if (!product || stale || !canOrder(store.merchant(product.merchantId))) {
    showToast("Menu changed. Review your cart before ordering"); modal.close(); render(); return;
  }
  let order;
  try { order = buildPickupOrder(details, store.merchant(product.merchantId), store.state.cart.map(line => ({...line, unitPrice: linePrice(line)}))); }
  catch (error) { showToast(error.message); return; }
  store.state.customerDetails = order.customerDetails;
  store.state.orders.unshift(order);
  store.state.cart = []; store.state.customerTab = "orders"; store.state.selectedMerchantId = null;
  store.log("pickup_order_created", {orderId: order.id, merchantId: product.merchantId});
  modal.close(); showToast(`Order ${order.id} sent`); render();
}

function renderMerchant() {
  const merchant = store.merchant(store.state.merchantId);
  if (!merchant) { app.innerHTML = `<div class="empty">No merchant selected.</div>`; return; }
  const orders = store.state.orders.filter(o => o.merchantId === merchant.id);
  const active = orders.filter(o => ["new","accepted","ready"].includes(o.status));
  const tab = store.state.merchantTab || "orders";
  const tabs = [["orders","Orders"],["menu","Menu"],["store","Store"],["support","Support"]];
  const orderScreen = `<div class="section-head"><div><h2>Pickup queue</h2><p>Accept, prepare and hand over each order.</p></div><button class="btn ${merchant.online ? "ghost" : "primary"}" id="toggleOnline" ${merchant.listingStatus !== "active" ? "disabled" : ""}>${merchant.online ? "Close for orders" : "Open for orders"}</button></div>
    <div class="queue-grid">${["new","accepted","ready"].map(status => `<div class="queue-column"><h3>${status === "new" ? "New" : status === "accepted" ? "Preparing" : "Ready"} · ${active.filter(o => o.status === status).length}</h3>${active.filter(o => o.status === status).map(merchantOrderCard).join("") || `<div class="empty">Nothing here.</div>`}</div>`).join("")}</div>
    <section class="panel section"><h2>Order history</h2>${orders.filter(o => ["completed","cancelled"].includes(o.status)).map(o => `<div class="list-row"><div><strong>${esc(o.id)} · ${esc(o.customer)}</strong><p>${esc(o.createdAt)} · ${o.cancelReason ? `Reason: ${esc(o.cancelReason)}` : "Collected"}</p></div><div class="list-row-actions"><span class="badge ${o.status === "completed" ? "green" : "red"}">${esc(o.status)}</span><strong>${money(o.total)}</strong></div></div>`).join("") || `<div class="empty">Completed and cancelled orders appear here.</div>`}</section>`;
  const menuScreen = `<section class="panel"><div class="section-head"><div><h2>Your menu</h2><p>Edit products, paid extras and free removals.</p></div><button class="btn primary small" id="addMenuItem">+ Add item</button></div>
    ${merchant.menu.map(item => `<div class="list-row"><div class="menu-summary"><div class="menu-thumb" aria-hidden="true">${esc(item.emoji || "🥪")}</div><div><strong>${esc(item.name)}</strong><p>${money(item.price)} · ${choicesFor(item).length} choices</p></div></div><div class="list-row-actions"><button class="btn ghost small" data-edit-item="${item.id}">Edit</button><button class="btn ${item.available ? "ghost" : "dark"} small" data-toggle-item="${item.id}">${item.available ? "Available" : "Unavailable"}</button></div></div>`).join("") || `<div class="empty">Add your first product to prepare the listing.</div>`}</section>`;
  const storeScreen = `<div class="detail-layout"><section class="panel"><h2>Operating details</h2><form id="merchantStoreForm" class="editor-form"><div class="editor-pair"><label>Trading name<input name="name" required value="${esc(merchant.name)}"></label><label>Area<input name="area" required value="${esc(merchant.area)}"></label></div><label>Pickup address<input name="address" required value="${esc(merchant.address)}" autocomplete="street-address"></label><label>Usual prep time (minutes)<input name="prepMinutes" type="number" min="1" max="180" required value="${merchant.prepMinutes}"></label><div class="editor-pair"><label>Contact name<input name="contactName" value="${esc(merchant.contact?.name)}"></label><label>Phone<input name="phone" type="tel" value="${esc(merchant.contact?.phone)}"></label></div><label>Email<input name="email" type="email" value="${esc(merchant.contact?.email)}"></label><button class="btn primary" type="submit">Save store details</button></form><a class="text-link" href="${directionsUrl(merchant)}" target="_blank" rel="noopener noreferrer" data-directions="${merchant.id}">Open pickup address in Maps ↗</a></section>
    <section class="panel"><h2>Listing and quality</h2><p>${merchant.listingStatus === "active" ? "Your spot is listed." : "Your listing is awaiting GoodKota approval."} ${merchant.online ? "Customers can order now." : "Orders are currently closed."}</p><div class="action-row"><span class="badge ${merchant.listingStatus === "active" ? "green" : "amber"}">${esc(merchant.listingStatus)}</span><span class="badge ${merchant.quality?.status === "intervention" ? "red" : merchant.quality?.status === "watch" ? "amber" : "green"}">Quality: ${esc(merchant.quality?.status || "healthy")}</span></div><p class="muted">${esc(merchant.statusReason || "")}</p><p class="muted">${esc(merchant.quality?.note || "")}</p><div class="standard-list">${STANDARD.map(item => `<div class="standard-row"><span>${merchant.standard?.[item.id] ? "✓" : "•"}</span><span>${esc(item.name)}</span></div>`).join("")}</div><p class="muted">${esc(merchant.reviewNote || "")}</p></section></div>`;
  const supportScreen = `<div class="detail-layout"><section class="panel"><h2>Contact GoodKota</h2><form class="editor-form" id="merchantCaseForm"><label>Subject<input name="subject" required maxlength="80" placeholder="What do you need help with?"></label><label>Message<textarea name="message" required rows="5" maxlength="1000" placeholder="Give us the details"></textarea></label><button class="btn primary" type="submit">Send support request</button></form></section><section class="panel"><h2>Your cases</h2>${store.state.supportCases.filter(c => c.merchantId === merchant.id).map(c => `<div class="work-row"><div><strong>${esc(c.subject)}</strong><p>${esc(c.message)}</p>${c.note ? `<p class="muted">GoodKota: ${esc(c.note)}</p>` : ""}</div><span class="badge ${c.status === "resolved" ? "green" : "amber"}">${esc(c.status.replaceAll("_", " "))}</span></div>`).join("") || `<div class="empty">No support cases yet.</div>`}</section></div>`;
  app.innerHTML = `<div class="work-topline"><div class="page-title compact"><div class="eyebrow">Merchant workspace</div><h1>${esc(merchant.name)}</h1><p>Pickup orders and your storefront in one place.</p></div><label class="merchant-switch">Viewing spot<select id="merchantSwitch" aria-label="Select merchant">${store.state.merchants.map(m => `<option value="${esc(m.id)}" ${m.id === merchant.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label></div>
    <div class="metric-grid"><div class="metric"><div class="value">${merchant.online && merchant.listingStatus === "active" ? "Open" : "Closed"}</div><div class="label">Accepting orders</div></div><div class="metric"><div class="value">${active.length}</div><div class="label">Active pickup orders</div></div><div class="metric"><div class="value">${merchant.rating == null ? "—" : merchant.rating.toFixed(1)}</div><div class="label">Customer rating</div></div><div class="metric"><div class="value">${merchant.menu.filter(i => i.available).length}/${merchant.menu.length}</div><div class="label">Items available</div></div></div>
    <nav class="work-tabs" aria-label="Merchant sections">${tabs.map(([id,label]) => `<button class="${tab === id ? "active" : ""}" data-merchant-tab="${id}">${label}</button>`).join("")}</nav>
    ${tab === "menu" ? menuScreen : tab === "store" ? storeScreen : tab === "support" ? supportScreen : orderScreen}`;

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

function openMenuEditor(merchant, item) {
  const optionRow = option => `<div class="option-editor-row"><input name="optionName" aria-label="Option name" placeholder="Cheese slice or atchar" maxlength="50" required value="${esc(option?.name || "")}"><select name="optionKind" aria-label="Option type"><option value="add" ${option?.kind === "add" ? "selected" : ""}>Add extra</option><option value="remove" ${option?.kind === "remove" ? "selected" : ""}>Remove ingredient</option></select><input name="optionPrice" aria-label="Extra price in rand" type="number" min="0" max="999" step="0.01" inputmode="decimal" value="${option?.kind === "remove" ? "0" : ((option?.price || 0) / 100).toFixed(2)}" required><button class="btn ghost small" type="button" data-remove-option aria-label="Remove option">×</button></div>`;
  modal.innerHTML = `<form class="modal-body editor-form" id="menuForm"><div class="modal-head"><div><div class="eyebrow">Merchant menu</div><h2>${item ? "Edit item" : "Add item"}</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div><label>Item name<input name="name" required maxlength="80" value="${esc(item?.name || "")}" placeholder="Classic Kota"></label><label>Description<textarea name="desc" required maxlength="220" rows="2" placeholder="What comes with it">${esc(item?.desc || "")}</textarea></label><div class="editor-pair"><label>Price (R)<input name="price" type="number" min="1" max="9999" step="0.01" inputmode="decimal" required value="${item ? (item.price / 100).toFixed(2) : ""}"></label><label>Picture placeholder<select name="emoji"><option value="🥪" ${item?.emoji === "🥪" ? "selected" : ""}>🥪 Kota</option><option value="🍔" ${item?.emoji === "🍔" ? "selected" : ""}>🍔 Loaded</option><option value="🍗" ${item?.emoji === "🍗" ? "selected" : ""}>🍗 Chicken</option></select></label></div><div class="option-editor"><div class="section-head"><div><strong>Customer choices</strong><p class="muted">Add a paid extra or let customers leave out an ingredient. Removals are free.</p></div><button class="btn ghost small" type="button" id="addOption">+ Choice</button></div><div id="optionRows">${choicesFor(item).map(optionRow).join("")}</div></div><label class="inline-check"><input name="available" type="checkbox" ${!item || item.available ? "checked" : ""}> Available to order</label><button class="btn primary wide" type="submit">Save item</button></form>`;
  modal.showModal();
  const form = modal.querySelector("#menuForm");
  form.querySelector("[data-close]").addEventListener("click", () => modal.close());
  form.querySelector("#addOption").addEventListener("click", () => form.querySelector("#optionRows").insertAdjacentHTML("beforeend", optionRow()));
  form.addEventListener("click", event => { if (event.target.closest("[data-remove-option]")) event.target.closest(".option-editor-row").remove(); });
  form.addEventListener("change", event => { if (event.target.name === "optionKind" && event.target.value === "remove") event.target.closest(".option-editor-row").querySelector('[name="optionPrice"]').value = "0.00"; });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = data.get("name").trim();
    const desc = data.get("desc").trim();
    if (!name || !desc) { showToast("Enter a name and description"); return; }
    const rows = [...form.querySelectorAll(".option-editor-row")];
    const names = rows.map(row => `${row.querySelector('[name="optionKind"]').value}:${row.querySelector('[name="optionName"]').value.trim().toLowerCase()}`);
    if (rows.some(row => !row.querySelector('[name="optionName"]').value.trim()) || new Set(names).size !== names.length) { showToast("Give each choice a unique name"); return; }
    const old = choicesFor(item);
    const choices = rows.map(row => {
      const name = row.querySelector('[name="optionName"]').value.trim();
      const kind = row.querySelector('[name="optionKind"]').value;
      const price = kind === "remove" ? 0 : Math.round(Number(row.querySelector('[name="optionPrice"]').value) * 100);
      const existing = old.find(choice => choice.name.toLowerCase() === name.toLowerCase() && choice.kind === kind);
      return {id: existing?.id || `c-${crypto.randomUUID()}`, name, kind, price, available: true};
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

roleSelect.addEventListener("change", () => {
  store.state.role = roleSelect.value;
  store.state.selectedMerchantId = null;
  store.save();
  render();
});

document.querySelector("#brandHome").addEventListener("click", () => {
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

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));

render();
