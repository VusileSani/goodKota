import { escapeHtml, formatDateTime } from "../core/utils.js";
import { deliveryProgress, deliveryStatusLabel, nextDriverStatus } from "../services/delivery-service.js";

const ACTION_LABELS = {
  assigned: "Start towards merchant",
  driver_to_pickup: "Arrived at merchant",
  at_pickup: "Confirm pickup",
  picked_up: "Start delivery",
  en_route: "I'm near the customer"
};

export function renderDriverView(app) {
  const drivers = app.repos.delivery.listDrivers({ limit: 50 }).items;
  const deliveryEnabled = app.repos.platform.controls().deliveryEnabled;
  if (!app.currentDriverId || !app.repos.delivery.driver(app.currentDriverId)) app.currentDriverId = drivers[0]?.id;
  const driver = app.repos.delivery.driver(app.currentDriverId);
  const vehicle = app.repos.delivery.vehicle(driver.vehicleId);
  const task = driver.activeTaskId ? app.repos.delivery.task(driver.activeTaskId) : null;
  const order = task ? app.repos.orders.get(task.orderId) : null;
  const merchant = task ? app.repos.merchants.get(task.merchantId) : null;
  const location = app.repos.delivery.currentLocation(driver.id);
  const events = task ? app.repos.delivery.events(task.id, { limit: 5, direction: "desc" }).items : [];

  app.root.innerHTML = `
    <section class="actor-hero driver-hero">
      <div><span class="eyebrow">Driver workspace</span><h2>${escapeHtml(driver.name)}</h2><p>Current job, handover and support.</p></div>
      <select id="driverSwitcher" class="btn hero-switcher">
        ${drivers.map(item => `<option value="${item.id}" ${item.id === driver.id ? "selected" : ""}>${escapeHtml(item.name)} · ${item.operatorType === "goodkota" ? "Yagoya" : "Merchant"}</option>`).join("")}
      </select>
    </section>

    <div class="grid grid-4">
      <div class="stat"><span class="muted">Shift</span><b style="font-size:1rem">${escapeHtml(driver.shiftStatus)}</b></div>
      <div class="stat"><span class="muted">Availability</span><b style="font-size:1rem">${escapeHtml(driver.availability)}</b></div>
      <div class="stat"><span class="muted">Driver rating</span><b>⭐ ${Number(driver.rating || 0).toFixed(1)}</b></div>
      <div class="stat"><span class="muted">Completed</span><b>${driver.completedDeliveries}</b></div>
    </div>

    <section class="section">
      <div class="card">
        <span class="eyebrow">Driver & vehicle</span>
        <h3 style="margin:8px 0">${escapeHtml(driver.name)}</h3>
        <div class="summary-line"><span>Operator</span><strong>${driver.operatorType === "goodkota" ? "Yagoya fleet" : "Merchant fleet"}</strong></div>
        <div class="summary-line"><span>Vehicle</span><strong>${escapeHtml(vehicle?.type || "—")}</strong></div>
        <div class="summary-line"><span>Registration</span><strong>${escapeHtml(vehicle?.registration || "—")}</strong></div>
        <div class="summary-line"><span>Last location</span><strong>${location ? formatDateTime(location.recordedAt) : "No snapshot"}</strong></div>
        ${!driver.activeTaskId ? `<button class="btn ${driver.shiftStatus === "online" ? "danger" : "ok"}" id="shiftButton" style="margin-top:10px">${driver.shiftStatus === "online" ? "Go offline" : "Go online"}</button>` : '<div class="notice info" style="margin-top:12px">Shift state is locked while a delivery is active.</div>'}
        <button class="btn ghost" id="driverSupportButton" style="margin-top:10px">Driver support</button>
      </div>
    </section>

    ${!deliveryEnabled ? '<section class="section"><div class="notice"><strong>Delivery operations are paused by Yagoya.</strong><div class="small" style="margin-top:4px">Existing delivery records remain visible, but driver progression is temporarily disabled.</div></div></section>' : ""}
    ${task ? activeTaskMarkup(task, order, merchant, driver, events, deliveryEnabled) : `
      <section class="section">
        <div class="empty"><strong>No active delivery.</strong><br>Dispatch can assign an eligible job when this driver is online and available.</div>
      </section>`}
`;

  app.root.querySelector("#driverSwitcher").addEventListener("change", event => {
    app.currentDriverId = event.currentTarget.value;
    app.render();
  });

  app.root.querySelector("#shiftButton")?.addEventListener("click", () => {
    app.commands.setDriverShift({ driverId: driver.id, shiftStatus: driver.shiftStatus === "online" ? "offline" : "online" });
    app.render();
  });

  app.root.querySelector("#advanceDelivery")?.addEventListener("click", () => {
    if (!deliveryEnabled) return alert("Yagoya delivery operations are temporarily paused.");
    try {
      app.commands.advanceDriver({ driverId: driver.id });
      nudgeDriverLocation(app, driver.id);
      app.toast("Delivery status updated. Customer tracking now sees the new event.");
      app.render();
    } catch (error) { alert(error.message); }
  });

  app.root.querySelector("#completeDelivery")?.addEventListener("click", () => deliveryEnabled ? openPinDialog(app, driver) : alert("Yagoya delivery operations are temporarily paused."));
  app.root.querySelector("#driverSupportButton")?.addEventListener("click", () => openDriverSupport(app, driver));
  app.root.querySelector("#nudgeLocation")?.addEventListener("click", () => {
    nudgeDriverLocation(app, driver.id);
    app.toast("Location snapshot updated.");
    app.render();
  });
}

function activeTaskMarkup(task, order, merchant, driver, events, deliveryEnabled) {
  const progress = deliveryProgress(task.status);
  const next = nextDriverStatus(task.status);
  return `
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Active delivery</span><h2>${escapeHtml(order?.orderNumber || task.orderId)}</h2><p>${escapeHtml(deliveryStatusLabel(task.status))}</p></div><span class="badge dark">${progress}%</span></div>
      <div class="progress delivery-progress"><span style="width:${progress}%"></span></div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card">
          <h3>Route</h3>
          <div class="route-stop"><span class="route-marker">A</span><div><strong>${escapeHtml(merchant?.name || task.pickup.address)}</strong><div class="muted small">${escapeHtml(task.pickup.address)}</div></div></div>
          <div class="route-line"></div>
          <div class="route-stop"><span class="route-marker">B</span><div><strong>${escapeHtml(order?.customer || "Customer")}</strong><div class="muted small">${escapeHtml(task.dropoff.address)}</div></div></div>
          <div class="row-actions" style="margin-top:16px">
            ${next ? `<button class="btn primary" id="advanceDelivery" ${deliveryEnabled ? "" : "disabled"}>${escapeHtml(ACTION_LABELS[task.status] || "Next delivery step")}</button>` : ""}
            ${task.status === "arriving" ? `<button class="btn ok" id="completeDelivery" ${deliveryEnabled ? "" : "disabled"}>Complete with customer PIN</button>` : ""}
            ${!["delivered", "cancelled"].includes(task.status) ? '<button class="btn ghost" id="nudgeLocation">Update location</button>' : ""}
          </div>
        </div>
        <div class="card">
          <h3>Recent delivery events</h3>
          <div class="timeline">${events.map(event => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(event.message)}</strong><div class="muted small">${formatDateTime(event.createdAt)}</div></div></div>`).join("") || '<div class="muted">No events yet.</div>'}</div>
        </div>
      </div>
    </section>`;
}

function nudgeDriverLocation(app, driverId) {
  const driver = app.repos.delivery.driver(driverId);
  const task = driver?.activeTaskId ? app.repos.delivery.task(driver.activeTaskId) : null;
  if (!task) return;
  const current = app.repos.delivery.currentLocation(driverId);
  const target = ["assigned", "driver_to_pickup", "at_pickup"].includes(task.status) ? task.pickup : task.dropoff;
  const startLat = current?.latitude ?? task.pickup.latitude;
  const startLng = current?.longitude ?? task.pickup.longitude;
  const ratio = task.status === "arriving" ? 0.85 : 0.35;
  app.commands.updateDriverLocation({
    driverId,
    latitude: startLat + (target.latitude - startLat) * ratio,
    longitude: startLng + (target.longitude - startLng) * ratio,
    accuracyMeters: 12
  });
}

function openDriverSupport(app, driver) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><div><span class="eyebrow">Driver support</span><h2>Report an issue</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="driverSupportForm" class="form-grid">
        <label class="field full">Subject<input id="driverSupportSubject" required /></label>
        <label class="field full">Message<textarea id="driverSupportMessage" rows="5" required></textarea></label>
        <button class="btn primary field full">Send to Yagoya</button>
      </form>
    </div>`);
  app.dialog.querySelector("#driverSupportForm").addEventListener("submit", event => {
    event.preventDefault();
    app.commands.createSupportCase({ source: "driver", sourceId: driver.id, sourceName: driver.name, subject: app.dialog.querySelector("#driverSupportSubject").value, message: app.dialog.querySelector("#driverSupportMessage").value, priority: "normal" });
    app.closeDialog();
    app.toast("Support request sent to Yagoya.");
    app.render();
  });
}

function openPinDialog(app, driver) {
  const task = app.repos.delivery.task(driver.activeTaskId);
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Confirm delivery</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="notice info">Ask the customer for their 4-digit delivery PIN.</div>
      <form id="pinForm" style="margin-top:14px">
        <label class="field">Customer PIN<input id="deliveryPin" inputmode="numeric" maxlength="4" autocomplete="one-time-code" required /></label>
        <button class="btn primary" style="width:100%;margin-top:14px">Verify & complete delivery</button>
      </form>
    </div>`);

  app.dialog.querySelector("#pinForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      app.commands.confirmDelivery({ driverId: driver.id, pin: app.dialog.querySelector("#deliveryPin").value });
      app.closeDialog();
      app.toast("Delivery verified, order completed and driver released.");
      app.render();
    } catch (error) { alert(error.message); }
  });
}
