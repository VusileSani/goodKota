import { escapeHtml, formatDateTime } from "../core/utils.js";
import { currentDriverLocation, deliveryProgress, deliveryStatusLabel, nextDriverStatus, trackingEvents } from "../services/delivery-service.js";

const ACTION_LABELS = {
  assigned: "Start towards outlet",
  driver_to_outlet: "Arrived at outlet",
  at_outlet: "Confirm pickup",
  picked_up: "Start delivery",
  en_route: "I'm near the customer"
};

export function renderDriverView(app) {
  const drivers = app.store.state.drivers;
  if (!app.demoDriverId || !app.store.driver(app.demoDriverId)) app.demoDriverId = drivers[0]?.id;
  const driver = app.store.driver(app.demoDriverId);
  const vehicle = app.store.vehicle(driver.vehicleId);
  const task = driver.activeTaskId ? app.store.deliveryTask(driver.activeTaskId) : null;
  const order = task ? app.store.state.orders.find(item => item.id === task.orderId) : null;
  const outlet = task ? app.store.outlet(task.outletId) : null;
  const location = currentDriverLocation(app.store.state, driver.id);
  const events = task ? trackingEvents(app.store.state, task.id).slice(-5).reverse() : [];

  app.root.innerHTML = `
    <section class="section-head">
      <div><span class="eyebrow">Driver</span><h2>${escapeHtml(driver.name)}</h2><p>Current job and handover.</p></div>
      <select id="driverSwitcher" class="btn ghost">
        ${drivers.map(item => `<option value="${item.id}" ${item.id === driver.id ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.operatorType)}</option>`).join("")}
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
        <div class="summary-line"><span>Operator</span><strong>${driver.operatorType === "goodkota" ? "GoodKota fleet" : "Merchant fleet"}</strong></div>
        <div class="summary-line"><span>Vehicle</span><strong>${escapeHtml(vehicle?.type || "—")}</strong></div>
        <div class="summary-line"><span>Registration</span><strong>${escapeHtml(vehicle?.registration || "—")}</strong></div>
        <div class="summary-line"><span>Last location</span><strong>${location ? formatDateTime(location.recordedAt) : "No snapshot"}</strong></div>
        ${!driver.activeTaskId ? `<button class="btn ${driver.shiftStatus === "online" ? "danger" : "ok"}" id="shiftButton" style="margin-top:10px">${driver.shiftStatus === "online" ? "Go offline" : "Go online"}</button>` : '<div class="notice info" style="margin-top:12px">Shift state is locked while a delivery is active.</div>'}
      </div>
    </section>

    ${task ? activeTaskMarkup(task, order, outlet, driver, events) : `
      <section class="section">
        <div class="empty"><strong>No active delivery.</strong><br>Dispatch can assign an eligible job when this driver is online and available.</div>
      </section>`}
`;

  app.root.querySelector("#driverSwitcher").addEventListener("change", event => {
    app.demoDriverId = event.currentTarget.value;
    app.render();
  });

  app.root.querySelector("#shiftButton")?.addEventListener("click", () => {
    app.store.setDriverShift(driver.id, driver.shiftStatus === "online" ? "offline" : "online");
    app.render();
  });

  app.root.querySelector("#advanceDelivery")?.addEventListener("click", () => {
    try {
      app.store.advanceDriverTask(driver.id);
      nudgeDriverLocation(app, driver.id);
      app.toast("Delivery status updated. Customer tracking now sees the new event.");
      app.render();
    } catch (error) { alert(error.message); }
  });

  app.root.querySelector("#completeDelivery")?.addEventListener("click", () => openPinDialog(app, driver));
  app.root.querySelector("#nudgeLocation")?.addEventListener("click", () => {
    nudgeDriverLocation(app, driver.id);
    app.toast("Demo GPS snapshot updated.");
    app.render();
  });
}

function activeTaskMarkup(task, order, outlet, driver, events) {
  const progress = deliveryProgress(task.status);
  const next = nextDriverStatus(task.status);
  return `
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Active delivery</span><h2>${escapeHtml(order?.id || task.orderId)}</h2><p>${escapeHtml(deliveryStatusLabel(task.status))}</p></div><span class="badge dark">${progress}%</span></div>
      <div class="progress delivery-progress"><span style="width:${progress}%"></span></div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card">
          <h3>Route</h3>
          <div class="route-stop"><span class="route-marker">A</span><div><strong>${escapeHtml(outlet?.name || task.pickup.address)}</strong><div class="muted small">${escapeHtml(task.pickup.address)}</div></div></div>
          <div class="route-line"></div>
          <div class="route-stop"><span class="route-marker">B</span><div><strong>${escapeHtml(order?.customer || "Customer")}</strong><div class="muted small">${escapeHtml(task.dropoff.address)}</div></div></div>
          <div class="row-actions" style="margin-top:16px">
            ${next ? `<button class="btn primary" id="advanceDelivery">${escapeHtml(ACTION_LABELS[task.status] || "Next delivery step")}</button>` : ""}
            ${task.status === "arriving" ? '<button class="btn ok" id="completeDelivery">Complete with customer PIN</button>' : ""}
            ${!["delivered", "cancelled"].includes(task.status) ? '<button class="btn ghost" id="nudgeLocation">Simulate GPS update</button>' : ""}
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
  const driver = app.store.driver(driverId);
  const task = driver?.activeTaskId ? app.store.deliveryTask(driver.activeTaskId) : null;
  if (!task) return;
  const current = currentDriverLocation(app.store.state, driverId);
  const target = ["assigned", "driver_to_outlet", "at_outlet"].includes(task.status) ? task.pickup : task.dropoff;
  const startLat = current?.latitude ?? task.pickup.latitude;
  const startLng = current?.longitude ?? task.pickup.longitude;
  const ratio = task.status === "arriving" ? 0.85 : 0.35;
  app.store.updateDriverLocation(
    driverId,
    startLat + (target.latitude - startLat) * ratio,
    startLng + (target.longitude - startLng) * ratio,
    12
  );
}

function openPinDialog(app, driver) {
  const task = app.store.deliveryTask(driver.activeTaskId);
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Confirm delivery</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="notice info">Ask the customer for their 4-digit delivery PIN.</div>
      <form id="pinForm" style="margin-top:14px">
        <label class="field">Customer PIN<input id="deliveryPin" inputmode="numeric" maxlength="4" autocomplete="one-time-code" required /></label>
        <button class="btn primary" style="width:100%;margin-top:14px">Verify & complete delivery</button>
      </form>
      <div class="muted small" style="margin-top:8px">Demo hint: customer tracking displays PIN ${escapeHtml(task.verification?.demoPin || "")}</div>
    </div>`);

  app.dialog.querySelector("#pinForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      app.store.confirmDelivery(driver.id, app.dialog.querySelector("#deliveryPin").value);
      app.closeDialog();
      app.toast("Delivery verified, order completed and driver released.");
      app.render();
    } catch (error) { alert(error.message); }
  });
}
