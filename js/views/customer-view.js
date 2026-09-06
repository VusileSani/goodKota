import { escapeHtml, formatDateTime, money } from "../core/utils.js";
import { qualityBadge, isEligibleForProximityRecommendation } from "../services/quality-service.js";
import { currentDriverLocation, deliveryProgress, deliveryStatusLabel, trackingEvents } from "../services/delivery-service.js";

function cartSubtotal(app) {
  return app.cart.reduce((total, line) => {
    const product = app.store.product(line.productId);
    return total + (product?.price || 0) * line.qty;
  }, 0);
}

function cartCount(app) {
  return app.cart.reduce((total, line) => total + line.qty, 0);
}

function outletCard(outlet, index, selectedId) {
  const badge = qualityBadge(outlet.qualityWorkflow.status, outlet.qualitySummary.signal);
  const distance = outlet.distanceKm < 1
    ? `${Math.round(outlet.distanceKm * 1000)} m away`
    : `${outlet.distanceKm.toFixed(1)} km away`;

  return `
    <article class="outlet-card ${index === 0 ? "closest" : ""} ${selectedId === outlet.id ? "selected" : ""}">
      <div>
        <div class="outlet-title">
          <h3>${escapeHtml(outlet.name)}</h3>
          ${index === 0 ? '<span class="badge dark">Closest to you</span>' : ""}
          <span class="badge ${badge.tone}">${badge.label}</span>
          ${outlet.delivery?.enabled ? '<span class="badge info">Delivery</span>' : ""}
        </div>
        <div class="outlet-meta">
          <span>📍 ${escapeHtml(distance)}</span>
          <span>⏱ ~${outlet.prepMinutes} min</span>
          <span>${escapeHtml(outlet.address)}</span>
        </div>
        <div class="rating-line">
          <span>⭐</span>
          <span class="rating-score">${outlet.qualitySummary.overall.toFixed(1)}</span>
          <span class="muted small">${outlet.qualitySummary.count} verified ratings</span>
          <span class="muted small">Food ${outlet.qualitySummary.food.toFixed(1)} · Service ${outlet.qualitySummary.service.toFixed(1)}</span>
        </div>
      </div>
      <button class="btn ${selectedId === outlet.id ? "primary" : "dark"}" data-select-outlet="${outlet.id}">
        ${selectedId === outlet.id ? "Selected" : "View menu"}
      </button>
    </article>`;
}

function menuItem(product) {
  return `
    <article class="menu-item">
      <div class="menu-art">${product.emoji || "🥪"}</div>
      <div class="menu-body">
        <span class="badge">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="muted small">${escapeHtml(product.desc)}</div>
        <div class="menu-footer">
          <span class="price">${money(product.price)}</span>
          <button class="btn primary small" data-add-product="${product.id}">Add</button>
        </div>
      </div>
    </article>`;
}

function cartMarkup(app, outlet) {
  const lines = app.cart.map(line => {
    const product = app.store.product(line.productId);
    if (!product) return "";
    return `
      <div class="cart-line">
        <div><strong>${escapeHtml(product.name)}</strong><div class="muted small">${money(product.price)} each</div></div>
        <div class="qty">
          <button data-qty="-1" data-product="${product.id}">−</button>
          <strong>${line.qty}</strong>
          <button data-qty="1" data-product="${product.id}">+</button>
        </div>
        <strong>${money(product.price * line.qty)}</strong>
      </div>`;
  }).join("");

  const subtotal = cartSubtotal(app);
  const delivery = app.deliveryMode === "Home Delivery" ? outlet.deliveryFee : 0;

  return `
    ${lines || '<div class="empty">Your cart is empty.</div>'}
    <div style="margin-top:10px">
      <div class="summary-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      <div class="summary-line"><span>Delivery</span><strong>${money(delivery)}</strong></div>
      <div class="summary-line total"><span>Total</span><strong>${money(subtotal + delivery)}</strong></div>
    </div>
    <button class="btn primary" id="checkoutButton" style="width:100%;margin-top:12px" ${app.cart.length ? "" : "disabled"}>Secure checkout</button>`;
}

function recentOrders(app) {
  const customer = app.store.customer;
  const orders = app.store.state.orders.filter(order => order.customerId === customer.id).slice(0, 7);
  if (!orders.length) return '<div class="empty">No orders yet.</div>';

  return orders.map(order => {
    const outlet = app.store.outlet(order.outletId);
    const task = app.store.deliveryTaskForOrder(order.id);
    const canRate = order.status === "completed" && !order.rated;
    const trackable = task && !["cancelled"].includes(task.status);
    return `
      <div class="outlet-card">
        <div>
          <div class="outlet-title">
            <strong>${order.id}</strong>
            <span class="badge ${order.status === "completed" ? "ok" : "info"}">${escapeHtml(order.status)}</span>
            ${task ? `<span class="badge dark">${escapeHtml(deliveryStatusLabel(task.status))}</span>` : ""}
          </div>
          <div class="outlet-meta"><span>${escapeHtml(outlet?.name || "")}</span><span>${formatDateTime(order.createdAt)}</span><span>${money(order.amount)}</span></div>
        </div>
        <div class="row-actions">
          ${trackable ? `<button class="btn dark small" data-track-order="${order.id}">${task.status === "delivered" ? "Delivery record" : "Track delivery"}</button>` : ""}
          ${canRate ? `<button class="btn primary small" data-rate-order="${order.id}">Rate this kota</button>` : order.rated ? '<span class="badge ok">✓ Rated</span>' : ""}
        </div>
      </div>`;
  }).join("");
}

export function renderCustomerView(app) {
  const ranked = app.getRankedOutlets();
  if (!app.selectedOutletId || !ranked.some(outlet => outlet.id === app.selectedOutletId)) {
    app.selectedOutletId = ranked[0]?.id || null;
  }

  const selectedOutlet = app.store.outlet(app.selectedOutletId);
  if (selectedOutlet && !selectedOutlet.delivery?.enabled && app.deliveryMode === "Home Delivery") app.deliveryMode = "Takeaway";
  const products = selectedOutlet ? app.store.productsForOutlet(selectedOutlet.id) : [];
  const nearbyEligible = ranked.filter(isEligibleForProximityRecommendation).length;
  const customer = app.store.customer;

  app.root.innerHTML = `
    <section class="hero">
      <div>
        <span class="eyebrow">📍 Nearby kota</span>
        <h1>Find a good kota nearby.</h1>
        <p>The closest eligible GoodKota outlets come first, with verified quality visible before you order.</p>
        <div class="location-bar">
          <input id="areaSearch" value="${escapeHtml(app.location.label)}" placeholder="Midrand, Tembisa, Soweto..." aria-label="Search area" />
          <button class="btn primary" id="searchArea">Search area</button>
        </div>
        <button class="btn ghost" id="useLocation" style="margin-top:10px;color:#fff;border-color:#596273">◎ Use my current location</button>
        <div class="muted small" id="locationMessage" style="margin-top:8px;color:#cbd5e1">Ranking from ${escapeHtml(app.location.label)}.</div>
      </div>
      <aside class="hero-card">
        <div class="eyebrow">GoodKota Standard</div>
        <h3>Individual kota. Predictably good experience.</h3>
        <p>Verified order ratings feed a quality system. Consistent problems are flagged to GoodKota Office for intervention with the outlet owner.</p>
        <div class="summary-line"><span>Nearby quality outlets</span><strong>${nearbyEligible}</strong></div>
        <div class="summary-line"><span>Closest outlet</span><strong>${ranked[0] ? ranked[0].distanceKm.toFixed(1) + " km" : "—"}</strong></div>
        <button class="btn ghost small" id="notificationButton" style="margin-top:10px;color:#fff;border-color:#7c6961">${customer.notificationPreferences.nearbyQualityOutlets ? "Nearby alerts on" : "Enable nearby alerts"}</button>
      </aside>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Kota spots near you</h2><p>Distance determines the order. Quality is visible and continuously monitored.</p></div>
      </div>
      <div class="outlet-list">
        ${ranked.map((outlet, index) => outletCard(outlet, index, app.selectedOutletId)).join("") || '<div class="empty">No GoodKota outlets available near this demo area yet.</div>'}
      </div>
    </section>

    ${selectedOutlet ? `
      <section class="section">
        <div class="section-head">
          <div><h2>${escapeHtml(selectedOutlet.name)} menu</h2><p>${escapeHtml(selectedOutlet.address)} · minimum order ${money(selectedOutlet.minOrder)}</p></div>
          <select id="deliveryMode" style="max-width:190px" class="btn ghost">
            <option ${app.deliveryMode === "Takeaway" ? "selected" : ""}>Takeaway</option>
            ${selectedOutlet.delivery?.enabled ? `<option ${app.deliveryMode === "Home Delivery" ? "selected" : ""}>Home Delivery</option>` : ""}
          </select>
        </div>
        <div class="grid customer-commerce">
          <div class="menu-grid">${products.map(menuItem).join("")}</div>
          <aside class="card">
            <div class="section-head" style="margin-bottom:4px"><h3>Your cart</h3><span class="badge">${cartCount(app)} items</span></div>
            ${cartMarkup(app, selectedOutlet)}
          </aside>
        </div>
      </section>` : ""}

    <section class="section">
      <div class="section-head"><div><h2>Your recent orders</h2><p>Track active deliveries and rate completed GoodKota orders.</p></div></div>
      <div class="outlet-list">${recentOrders(app)}</div>
    </section>`;

  bindCustomerEvents(app);
}

function bindCustomerEvents(app) {
  app.root.querySelector("#useLocation")?.addEventListener("click", async () => {
    const message = app.root.querySelector("#locationMessage");
    message.textContent = "Requesting your location…";
    try { await app.useCurrentLocation(); } catch (error) { message.textContent = error.message; }
  });

  app.root.querySelector("#searchArea")?.addEventListener("click", () => app.searchArea(app.root.querySelector("#areaSearch").value));
  app.root.querySelector("#areaSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter") app.searchArea(event.currentTarget.value);
  });
  app.root.querySelectorAll("[data-select-outlet]").forEach(button => button.addEventListener("click", () => app.selectOutlet(button.dataset.selectOutlet)));
  app.root.querySelectorAll("[data-add-product]").forEach(button => button.addEventListener("click", () => app.addToCart(button.dataset.addProduct)));
  app.root.querySelectorAll("[data-qty]").forEach(button => button.addEventListener("click", () => app.changeQuantity(button.dataset.product, Number(button.dataset.qty))));
  app.root.querySelector("#deliveryMode")?.addEventListener("change", event => { app.deliveryMode = event.currentTarget.value; app.render(); });
  app.root.querySelector("#checkoutButton")?.addEventListener("click", () => openCheckout(app));
  app.root.querySelector("#notificationButton")?.addEventListener("click", () => app.enableNearbyNotifications());
  app.root.querySelectorAll("[data-rate-order]").forEach(button => button.addEventListener("click", () => openRating(app, button.dataset.rateOrder)));
  app.root.querySelectorAll("[data-track-order]").forEach(button => button.addEventListener("click", () => openTracking(app, button.dataset.trackOrder)));
}

function openCheckout(app) {
  const outlet = app.store.outlet(app.selectedOutletId);
  const merchant = app.store.merchant(outlet.merchantId);
  const subtotal = cartSubtotal(app);
  const delivery = app.deliveryMode === "Home Delivery" ? outlet.deliveryFee : 0;
  const total = subtotal + delivery;
  const customer = app.store.customer;

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Secure checkout</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="form-grid">
        <label class="field">Name<input id="checkoutName" value="${escapeHtml(customer.name)}" /></label>
        <label class="field">Phone<input id="checkoutPhone" value="${escapeHtml(customer.phone)}" /></label>
        <label class="field">Email<input id="checkoutEmail" type="email" value="${escapeHtml(customer.email)}" /></label>
        ${app.deliveryMode === "Home Delivery" ? '<label class="field">Delivery address<input id="checkoutAddress" placeholder="Street / complex / suburb" required /></label>' : ""}
        <label class="field full">Order notes<textarea id="checkoutNotes" rows="3" placeholder="No onions, extra sauce..."></textarea></label>
      </div>
      <div class="card soft" style="margin-top:14px">
        <div class="summary-line"><span>Outlet</span><strong>${escapeHtml(outlet.name)}</strong></div>
        <div class="summary-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <div class="summary-line"><span>Delivery</span><strong>${money(delivery)}</strong></div>
        <div class="summary-line total"><span>To pay</span><strong>${money(total)}</strong></div>
      </div>
      <button class="btn primary" id="payButton" style="width:100%;margin-top:14px">Pay ${money(total)} securely</button>
      <div class="muted small" style="margin-top:8px">Prototype checkout — payment is simulated.</div>
    </div>`);

  app.dialog.querySelector("#payButton")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Confirming payment…";
    try {
      const orderId = `GK${String(3000 + app.store.state.orders.length + 1)}`;
      const customerDetails = {
        name: app.dialog.querySelector("#checkoutName").value.trim(),
        phone: app.dialog.querySelector("#checkoutPhone").value.trim(),
        email: app.dialog.querySelector("#checkoutEmail").value.trim()
      };
      const deliveryAddress = app.dialog.querySelector("#checkoutAddress")?.value.trim() || "";
      if (!customerDetails.name || !customerDetails.phone || !customerDetails.email) throw new Error("Name, phone and email are required.");
      if (subtotal < outlet.minOrder) throw new Error(`Minimum order is ${money(outlet.minOrder)}.`);
      if (app.deliveryMode === "Home Delivery" && !deliveryAddress) throw new Error("Delivery address is required.");

      const fulfilment = app.deliveryMode === "Home Delivery"
        ? {
            type: "delivery",
            provider: outlet.delivery?.providerPreference || "goodkota_fleet",
            destination: { address: deliveryAddress, latitude: app.location.lat, longitude: app.location.lng }
          }
        : { type: "pickup" };

      const payment = await app.paymentService.createPayment({
        amount: total,
        orderId,
        merchant,
        customer: customerDetails,
        breakdown: { foodAmount: subtotal, deliveryAmount: delivery },
        fulfilment
      });
      app.store.addPayment(payment);
      app.store.addOrder({
        id: orderId,
        customerId: customer.id,
        merchantId: merchant.id,
        outletId: outlet.id,
        customer: customerDetails.name,
        phone: customerDetails.phone,
        email: customerDetails.email,
        mode: app.deliveryMode,
        address: deliveryAddress,
        notes: app.dialog.querySelector("#checkoutNotes").value.trim(),
        amount: total,
        deliveryFee: delivery,
        fulfilment,
        status: "pending",
        paymentStatus: "paid",
        paymentId: payment.paymentId,
        createdAt: Date.now(),
        items: app.cart.map(line => {
          const product = app.store.product(line.productId);
          return { productId: product.id, name: product.name, qty: line.qty, price: product.price };
        }),
        rated: false
      });
      app.cart = [];
      app.closeDialog();
      app.toast(app.deliveryMode === "Home Delivery"
        ? `Payment confirmed. Order ${orderId} sent to ${outlet.name}; delivery task created.`
        : `Payment confirmed. Order ${orderId} sent to ${outlet.name}.`);
      app.render();
    } catch (error) {
      button.disabled = false;
      button.textContent = `Pay ${money(total)} securely`;
      alert(error.message);
    }
  });
}

function openTracking(app, orderId) {
  const order = app.store.state.orders.find(item => item.id === orderId);
  const task = app.store.deliveryTaskForOrder(orderId);
  if (!order || !task) return;
  const outlet = app.store.outlet(task.outletId);
  const driver = task.assignedDriverId ? app.store.driver(task.assignedDriverId) : null;
  const vehicle = driver ? app.store.vehicle(driver.vehicleId) : null;
  const location = driver ? currentDriverLocation(app.store.state, driver.id) : null;
  const events = trackingEvents(app.store.state, task.id).slice().reverse();
  const progress = deliveryProgress(task.status);
  const eta = task.estimatedArrivalAt && task.status !== "delivered" ? formatDateTime(task.estimatedArrivalAt) : "—";

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Delivery tracking</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="outlet-title"><strong>${order.id}</strong><span class="badge dark">${escapeHtml(deliveryStatusLabel(task.status))}</span></div>
      <div class="progress delivery-progress" style="margin:14px 0"><span style="width:${progress}%"></span></div>
      <div class="grid grid-2">
        <div class="card soft">
          <span class="eyebrow">Route</span>
          <div class="summary-line"><span>Pickup</span><strong>${escapeHtml(outlet?.name || task.pickup.address)}</strong></div>
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
      ${task.status !== "delivered" && task.verification?.demoPin ? `<div class="notice info" style="margin-top:14px"><strong>Delivery PIN: ${escapeHtml(task.verification.demoPin)}</strong><br><span class="small">Give this PIN to the driver only when your order is handed to you.</span></div>` : ""}
      <h3 style="margin-top:20px">Delivery timeline</h3>
      <div class="timeline">${events.map(event => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(event.message)}</strong><div class="muted small">${formatDateTime(event.createdAt)}</div></div></div>`).join("")}</div>
      <button class="btn ghost" id="refreshTracking" style="width:100%;margin-top:14px">Refresh tracking snapshot</button>
    </div>`);

  app.dialog.querySelector("#refreshTracking")?.addEventListener("click", () => openTracking(app, orderId));
}

function openRating(app, orderId) {
  const order = app.store.state.orders.find(item => item.id === orderId);
  const outlet = app.store.outlet(order.outletId);

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Rate your kota</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="notice"><strong>Verified GoodKota Order</strong><br><span class="small">${order.id} · ${escapeHtml(outlet.name)}</span></div>
      <form id="ratingForm" style="margin-top:14px">
        ${ratingField("Overall experience", "overall")}
        ${ratingField("Food / kota quality", "food")}
        ${ratingField("Service experience", "service")}
        <label class="field" style="margin-top:14px">Optional comment<textarea id="ratingComment" rows="3" placeholder="Tell GoodKota what stood out..."></textarea></label>
        <button class="btn primary" style="width:100%;margin-top:14px">Submit verified rating</button>
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
    app.store.addRating({ orderId, ...values, comment: app.dialog.querySelector("#ratingComment").value });
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
        ${[1,2,3,4,5].map(value => `<button data-value="${value}" aria-label="${value} stars">★</button>`).join("")}
      </div>
    </div>`;
}
