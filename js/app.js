import { Store } from "./core/store.js";
import { STANDARD } from "./data/seed.js";

const store = new Store();
const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");
const roleSelect = document.querySelector("#roleSelect");
const locationLabel = document.querySelector("#locationLabel");

const money = cents => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const standardPass = merchant => Object.values(merchant.standard).every(Boolean);
const firstLetter = text => esc(String(text).trim().slice(0,1).toUpperCase());

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
  else if (store.state.role === "admin") renderAdmin();
  else renderCustomer();
  bindCommon();
}

function bindCommon() {
  app.querySelectorAll("[data-open-merchant]").forEach(button => button.addEventListener("click", () => {
    store.state.selectedMerchantId = button.dataset.openMerchant;
    store.log("merchant_open", { merchantId: button.dataset.openMerchant });
    render();
  }));

  app.querySelectorAll("[data-favourite]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    const id = button.dataset.favourite;
    const set = new Set(store.state.favourites);
    set.has(id) ? set.delete(id) : set.add(id);
    store.state.favourites = [...set];
    store.log("favourite_toggle", { merchantId: id, active: set.has(id) });
    render();
  }));

  app.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => addToCart(button.dataset.add)));
  app.querySelectorAll("[data-cart]").forEach(button => button.addEventListener("click", openCart));
}

function renderCustomer() {
  if (store.state.selectedMerchantId) {
    app.innerHTML = merchantDetail(store.merchant(store.state.selectedMerchantId));
    return;
  }

  const tab = store.state.customerTab;
  app.innerHTML = tab === "saved" ? savedView() : tab === "orders" ? ordersView() : tab === "account" ? accountView() : discoverView();
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
        <p>GoodKota tells you where the good food is. Nearby first, quality made visible, no endless directory.</p>
        <label class="searchbar">
          <input id="discoverSearch" type="search" placeholder="Search a kota spot or area" autocomplete="off" />
          <button class="btn primary" type="button">Find kota</button>
        </label>
      </div>
    </section>

    <section class="section">
      <div class="authority-strip">
        <div class="authority-cell"><strong>Not every listing gets the badge.</strong><span>GoodKota is curated around a clear standard.</span></div>
        <div class="authority-cell"><strong>5</strong><span>checks in the GoodKota Standard</span></div>
        <div class="authority-cell"><strong>3</strong><span>verified picks near ${esc(store.state.location)}</span></div>
        <div class="authority-cell"><strong>Nearby</strong><span>distance leads, quality decides</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Where the good kota is</h2><p>Closest GoodKota picks first.</p></div>
        <div class="filter-row">
          ${["All","Verified","Best value","Chicken"].map(filter => `<button class="chip ${store.state.filter === filter ? "active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}
        </div>
      </div>
      <div class="merchant-grid" id="merchantGrid">${merchantCards(filteredMerchants())}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>The GoodKota Standard</h2><p>A simple reason to trust the badge.</p></div></div>
      <div class="criteria-grid">
        ${STANDARD.map((item, index) => `<article class="criteria-card"><div class="criteria-number">0${index + 1}</div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p></article>`).join("")}
      </div>
    </section>`;
}

function filteredMerchants() {
  const q = store.state.search.trim().toLowerCase();
  const filter = store.state.filter;
  return store.state.merchants
    .filter(m => m.online)
    .filter(m => !q || `${m.name} ${m.area} ${m.tags.join(" ")}`.toLowerCase().includes(q))
    .filter(m => filter === "All" || (filter === "Verified" && standardPass(m)) || m.tags.includes(filter))
    .sort((a,b) => a.distanceKm - b.distanceKm);
}

function updateMerchantGrid() {
  const grid = app.querySelector("#merchantGrid");
  if (!grid) return;
  grid.innerHTML = merchantCards(filteredMerchants());
  bindCommon();
}

function merchantCards(merchants) {
  if (!merchants.length) return `<div class="empty">No kota spots match that search yet.</div>`;
  return merchants.map((m, index) => `
    <article class="merchant-card" data-open-merchant="${m.id}">
      <div class="merchant-card-top">
        <div class="merchant-monogram">${firstLetter(m.name)}</div>
        <button class="link-button" data-favourite="${m.id}" aria-label="${store.state.favourites.includes(m.id) ? "Remove favourite" : "Save favourite"}">${store.state.favourites.includes(m.id) ? "♥" : "♡"}</button>
      </div>
      <h3>${esc(m.name)}</h3>
      <div class="address">${esc(m.area)}</div>
      <div class="merchant-facts">
        <span><strong>${m.distanceKm.toFixed(1)} km</strong></span>
        <span>★ ${m.rating.toFixed(1)}</span>
        <span>~${m.prepMinutes} min</span>
        <span>${esc(m.priceBand)}</span>
      </div>
      <div class="card-bottom">
        ${standardPass(m) ? `<span class="badge orange">✓ GoodKota Pick</span>` : `<span class="badge amber">Under review</span>`}
        <button class="link-button" data-open-merchant="${m.id}">${index === 0 ? "Closest · " : ""}See why →</button>
      </div>
    </article>`).join("");
}

function merchantDetail(merchant) {
  if (!merchant) return `<div class="empty">Merchant not found.</div>`;
  const checks = STANDARD.map(item => {
    const passed = Boolean(merchant.standard[item.id]);
    return `<div class="standard-row"><div class="standard-icon">${passed ? "✓" : "!"}</div><div><strong>${esc(item.name)}</strong><small>${esc(item.description)}</small></div><span class="badge ${passed ? "green" : "amber"}">${passed ? "Pass" : "Review"}</span></div>`;
  }).join("");

  return `
    <section class="detail-hero">
      <button class="link-button back" id="backDiscover">← Back to nearby</button>
      <div class="eyebrow">${standardPass(merchant) ? "GoodKota Pick" : "Quality review"}</div>
      <h1>${esc(merchant.name)}</h1>
      <p>${esc(merchant.area)} · ${merchant.distanceKm.toFixed(1)} km away · ★ ${merchant.rating.toFixed(1)} from ${merchant.verifiedRatings} verified ratings</p>
      <div class="detail-actions">
        <button class="btn primary" id="directionsButton">Get directions</button>
        <button class="btn light" data-favourite="${merchant.id}">${store.state.favourites.includes(merchant.id) ? "♥ Saved" : "♡ Save"}</button>
        <button class="btn light" data-cart>Cart · ${cartCount()}</button>
      </div>
    </section>

    <div class="detail-layout">
      <section class="panel">
        <div class="section-head"><div><h2>Order for pickup</h2><p>Keep the MVP simple: discover, choose, collect.</p></div></div>
        <div class="menu-list">
          ${merchant.menu.map(item => `<article class="menu-item"><div><h4>${esc(item.name)}</h4><p>${esc(item.desc)}</p></div><div class="menu-actions"><span class="price">${money(item.price)}</span><button class="btn dark small" data-add="${item.id}" ${item.available ? "" : "disabled"}>Add</button></div></article>`).join("")}
        </div>
      </section>
      <aside class="panel">
        <h2>Why it is here</h2>
        <p style="color:var(--muted);line-height:1.55">${esc(merchant.note)}</p>
        <div class="standard-list">${checks}</div>
      </aside>
    </div>`;
}

function savedView() {
  const merchants = store.state.merchants.filter(m => store.state.favourites.includes(m.id));
  return `<div class="page-title"><div class="eyebrow">Your shortcuts</div><h1>Saved kota spots</h1><p>Good places you want to find again.</p></div><div class="merchant-grid">${merchantCards(merchants)}</div>`;
}

function ordersView() {
  const orders = store.state.orders.filter(order => order.customer === "Sani");
  return `<div class="page-title"><div class="eyebrow">Pickup</div><h1>Your orders</h1><p>No delivery machinery in this MVP. Order, collect, eat.</p></div><section class="panel stack">${orders.map(orderRow).join("") || `<div class="empty">No orders yet.</div>`}</section>`;
}

function orderRow(order) {
  const merchant = store.merchant(order.merchantId);
  const tone = order.status === "completed" ? "green" : order.status === "ready" ? "orange" : "dark";
  return `<div class="list-row"><div><strong>${esc(merchant?.name || "GoodKota")}</strong><p>${esc(order.id)} · ${esc(order.createdAt)}</p></div><div class="list-row-actions"><span class="badge ${tone}">${esc(order.status)}</span><strong>${money(order.total)}</strong></div></div>`;
}

function accountView() {
  return `<div class="page-title"><div class="eyebrow">GoodKota account</div><h1>Keep it light.</h1><p>Only the account tools a customer needs for the MVP.</p></div><section class="panel"><div class="stack">${["My Orders","My Favourites","My Details","Help & Support","Account & Security"].map(label => `<div class="list-row"><strong>${label}</strong><span>›</span></div>`).join("")}</div></section>`;
}

function customerNav() {
  const tabs = [["discover","⌂","Discover"],["saved","♡","Saved"],["orders","≡","Orders"],["account","●","Account"]];
  return `<nav class="bottom-nav" aria-label="Customer navigation">${tabs.map(([id,icon,label]) => `<button class="${store.state.customerTab === id ? "active" : ""}" data-customer-tab="${id}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
}

function addToCart(productId) {
  const product = store.product(productId);
  if (!product) return;
  const existingMerchant = store.state.cart[0] ? store.product(store.state.cart[0].productId)?.merchantId : null;
  if (existingMerchant && existingMerchant !== product.merchantId) store.state.cart = [];
  const line = store.state.cart.find(item => item.productId === productId);
  line ? line.qty += 1 : store.state.cart.push({ productId, qty: 1 });
  store.log("cart_add", { productId, merchantId: product.merchantId });
  showToast(`${product.name} added`);
  render();
}

function cartCount() { return store.state.cart.reduce((sum, line) => sum + line.qty, 0); }
function cartTotal() { return store.state.cart.reduce((sum, line) => sum + (store.product(line.productId)?.price || 0) * line.qty, 0); }

function openCart() {
  const lines = store.state.cart.map(line => {
    const product = store.product(line.productId);
    return product ? `<div class="cart-line"><div><strong>${esc(product.name)}</strong><div style="color:var(--muted);font-size:12px">${money(product.price)}</div></div><div class="qty"><button data-qty="-1" data-product="${product.id}">−</button><strong>${line.qty}</strong><button data-qty="1" data-product="${product.id}">+</button></div><strong>${money(product.price * line.qty)}</strong></div>` : "";
  }).join("");

  modal.innerHTML = `<div class="modal-body"><div class="modal-head"><div><div class="eyebrow">Pickup order</div><h2>Your kota</h2></div><button class="modal-close" data-close>×</button></div><div style="margin-top:16px">${lines || `<div class="empty">Your cart is empty.</div>`}</div>${store.state.cart.length ? `<div class="cart-total"><span>Total</span><span>${money(cartTotal())}</span></div><button class="btn primary" style="width:100%;margin-top:16px" id="placeOrder">Place pickup order</button>` : ""}</div>`;
  modal.showModal();
  modal.querySelector("[data-close]").addEventListener("click", () => modal.close());
  modal.querySelectorAll("[data-qty]").forEach(button => button.addEventListener("click", () => {
    const line = store.state.cart.find(item => item.productId === button.dataset.product);
    if (!line) return;
    line.qty += Number(button.dataset.qty);
    if (line.qty <= 0) store.state.cart = store.state.cart.filter(item => item !== line);
    store.save();
    modal.close();
    openCart();
  }));
  modal.querySelector("#placeOrder")?.addEventListener("click", placeOrder);
}

function placeOrder() {
  if (!store.state.cart.length) return;
  const product = store.product(store.state.cart[0].productId);
  const id = `GK-${Math.floor(1100 + Math.random() * 800)}`;
  store.state.orders.unshift({
    id,
    merchantId: product.merchantId,
    customer: "Sani",
    status: "new",
    total: cartTotal(),
    items: store.state.cart.map(item => ({...item})),
    createdAt: "Just now"
  });
  store.state.cart = [];
  store.state.customerTab = "orders";
  store.state.selectedMerchantId = null;
  store.log("pickup_order_created", { orderId: id, merchantId: product.merchantId });
  modal.close();
  showToast(`Order ${id} sent`);
  render();
}

function renderMerchant() {
  const merchant = store.merchant(store.state.merchantId);
  const orders = store.state.orders.filter(o => o.merchantId === merchant.id && o.status !== "completed");
  const groups = ["new","accepted","ready"];
  app.innerHTML = `
    <div class="page-title"><div class="eyebrow">Merchant</div><h1>${esc(merchant.name)}</h1><p>The merchant MVP is deliberately operationally light.</p></div>
    <div class="metric-grid">
      <div class="metric"><div class="value">${merchant.online ? "Open" : "Closed"}</div><div class="label">Listing status</div></div>
      <div class="metric"><div class="value">${orders.length}</div><div class="label">Active pickup orders</div></div>
      <div class="metric"><div class="value">${merchant.rating.toFixed(1)}</div><div class="label">Verified rating</div></div>
      <div class="metric"><div class="value">${standardPass(merchant) ? "5/5" : "4/5"}</div><div class="label">GoodKota Standard</div></div>
    </div>

    <section class="section">
      <div class="section-head"><div><h2>Pickup queue</h2><p>Accept → ready → collected. Nothing more.</p></div><button class="btn ${merchant.online ? "ghost" : "primary"}" id="toggleOnline">${merchant.online ? "Close listing" : "Open listing"}</button></div>
      <div class="queue-grid">
        ${groups.map(status => `<div class="queue-column"><h3>${status === "new" ? "New" : status === "accepted" ? "Preparing" : "Ready"}</h3>${orders.filter(o => o.status === status).map(merchantOrderCard).join("") || `<div class="empty">Nothing here.</div>`}</div>`).join("")}
      </div>
    </section>

    <section class="section detail-layout">
      <div class="panel"><h2>Menu availability</h2>${merchant.menu.map(item => `<div class="list-row"><div><strong>${esc(item.name)}</strong><p>${money(item.price)}</p></div><button class="btn ${item.available ? "ghost" : "dark"} small" data-toggle-item="${item.id}">${item.available ? "Available" : "Unavailable"}</button></div>`).join("")}</div>
      <div class="panel"><h2>Your GoodKota listing</h2><p style="color:var(--muted);line-height:1.55">The badge is controlled by GoodKota. The merchant keeps operational information current.</p><div class="standard-list">${STANDARD.map(item => `<div class="standard-row"><div class="standard-icon">${merchant.standard[item.id] ? "✓" : "!"}</div><div><strong>${esc(item.name)}</strong></div><span class="badge ${merchant.standard[item.id] ? "green" : "amber"}">${merchant.standard[item.id] ? "Pass" : "Review"}</span></div>`).join("")}</div></div>
    </section>`;

  app.querySelector("#toggleOnline").addEventListener("click", () => { merchant.online = !merchant.online; store.save(); render(); });
  app.querySelectorAll("[data-order-next]").forEach(button => button.addEventListener("click", () => {
    const order = store.state.orders.find(o => o.id === button.dataset.orderNext);
    if (!order) return;
    order.status = order.status === "new" ? "accepted" : order.status === "accepted" ? "ready" : "completed";
    store.log("merchant_order_transition", { orderId: order.id, status: order.status });
    render();
  }));
  app.querySelectorAll("[data-toggle-item]").forEach(button => button.addEventListener("click", () => {
    const item = merchant.menu.find(i => i.id === button.dataset.toggleItem);
    item.available = !item.available;
    store.save();
    render();
  }));
}

function merchantOrderCard(order) {
  const labels = { new: "Accept", accepted: "Mark ready", ready: "Collected" };
  return `<article class="order-card"><h4>${esc(order.id)}</h4><p>${esc(order.customer)} · ${order.items.reduce((n,i) => n + i.qty, 0)} item(s)</p><div class="order-footer"><strong>${money(order.total)}</strong><button class="btn primary small" data-order-next="${order.id}">${labels[order.status]}</button></div></article>`;
}

function renderAdmin() {
  const metrics = store.state.metrics;
  app.innerHTML = `
    <div class="page-title"><div class="eyebrow">GoodKota control</div><h1>Own the kota category.</h1><p>The office view is focused on quality, hyperlocal coverage and repeat behaviour.</p></div>

    <div class="metric-grid">
      <article class="metric north-star"><div class="eyebrow">North star</div><div class="value">${metrics.repeatFinderRate}%</div><div class="label">30-day Repeat Finder Rate <strong style="color:white">↑ ${metrics.repeatFinderRate - metrics.repeatFinderPrevious} pts</strong></div><div class="definition">Users who complete a qualified GoodKota action on 2+ different days within 30 days ÷ users with at least one qualified action. Qualified = merchant open, save, directions or pickup order.</div></article>
      <article class="metric"><div class="value">${metrics.verifiedOutlets}</div><div class="label">Verified outlets in the launch cluster</div></article>
      <article class="metric"><div class="value">${metrics.pendingReview}</div><div class="label">Listings needing a decision</div></article>
    </div>

    <section class="section">
      <div class="section-head"><div><h2>GoodKota Standard</h2><p>One badge, five clear checks.</p></div></div>
      <div class="criteria-grid">${STANDARD.map((item,index) => `<article class="criteria-card"><div class="criteria-number">0${index+1}</div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p></article>`).join("")}</div>
    </section>

    <section class="section detail-layout">
      <div class="panel"><h2>Verification queue</h2>${store.state.candidates.map(candidate => candidateRow(candidate)).join("") || `<div class="empty">Queue clear.</div>`}</div>
      <div class="panel"><h2>Launch cluster</h2>${store.state.merchants.map(m => `<div class="list-row"><div><strong>${esc(m.name)}</strong><p>${esc(m.area)} · ${m.distanceKm.toFixed(1)} km</p></div><span class="badge ${standardPass(m) ? "green" : "amber"}">${standardPass(m) ? "Verified" : "Review"}</span></div>`).join("")}</div>
    </section>

    <section class="section panel"><div class="section-head"><div><h2>What we are not building yet</h2><p>The feature ceasefire is visible in the product.</p></div></div><div class="filter-row"><span class="chip">No driver fleet</span><span class="chip">No dispatch console</span><span class="chip">No subscriptions</span><span class="chip">No promotions engine</span><span class="chip">No social feed</span><span class="chip">No complex loyalty</span></div></section>`;

  app.querySelectorAll("[data-verify-candidate]").forEach(button => button.addEventListener("click", () => {
    const candidate = store.state.candidates.find(c => c.id === button.dataset.verifyCandidate);
    if (!candidate) return;
    if (!Object.values(candidate.checks).every(Boolean)) { showToast("All five checks must pass first"); return; }
    store.state.candidates = store.state.candidates.filter(c => c.id !== candidate.id);
    store.state.metrics.pendingReview = Math.max(0, store.state.metrics.pendingReview - 1);
    store.log("candidate_verified", { candidateId: candidate.id });
    showToast(`${candidate.name} verified`);
    render();
  }));
}

function candidateRow(candidate) {
  const count = Object.values(candidate.checks).filter(Boolean).length;
  return `<div class="list-row"><div><strong>${esc(candidate.name)}</strong><p>${esc(candidate.area)} · ${count}/5 checks passed</p></div><div class="list-row-actions"><span class="badge ${count === 5 ? "green" : "amber"}">${count}/5</span><button class="btn dark small" data-verify-candidate="${candidate.id}" ${count === 5 ? "" : "disabled"}>Verify</button></div></div>`;
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

document.querySelector("#locationButton").addEventListener("click", () => {
  const current = store.state.locations.indexOf(store.state.location);
  store.state.location = store.state.locations[(current + 1) % store.state.locations.length];
  store.log("location_change", { location: store.state.location });
  render();
});

app.addEventListener("click", event => {
  if (event.target.id === "backDiscover") {
    store.state.selectedMerchantId = null;
    store.save();
    render();
  }
  if (event.target.id === "directionsButton") {
    const merchant = store.merchant(store.state.selectedMerchantId);
    store.log("directions_intent", { merchantId: merchant?.id });
    showToast(`Directions intent recorded for ${merchant?.name}`);
  }
});

modal.addEventListener("click", event => {
  if (event.target === modal) modal.close();
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));

render();
