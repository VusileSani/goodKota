import { escapeHtml, formatDateTime, money } from "../core/utils.js";
import { currentDriverLocation, deliveryStatusLabel, estimateMinutes, isActiveDelivery, recommendDrivers } from "../services/delivery-service.js";

export function renderDeliveryOpsView(app) {
  const { state } = app.store;
  const tasks = state.deliveryTasks;
  const active = tasks.filter(isActiveDelivery);
  const dispatchable = tasks.filter(task => task.status === "ready_for_dispatch" && !task.assignedDriverId);
  const availableDrivers = state.drivers.filter(driver => driver.enabled && driver.shiftStatus === "online" && driver.availability === "available");
  const delivered = tasks.filter(task => task.status === "delivered");

  app.root.innerHTML = `
    <section class="section-head">
      <div><span class="eyebrow">Delivery Ops</span><h2>Dispatch</h2><p>Assign and monitor delivery jobs.</p></div>
    </section>

    <div class="metric-strip">
      <div class="stat"><span class="muted">Active deliveries</span><b>${active.length}</b></div>
      <div class="stat"><span class="muted">Awaiting assignment</span><b>${dispatchable.length}</b></div>
      <div class="stat"><span class="muted">Available drivers</span><b>${availableDrivers.length}</b></div>
    </div>

    <section class="section">
      <div class="section-head"><div><h3>Delivery queue</h3><p>Assign drivers, monitor the hand-off and see the customer-facing delivery state.</p></div></div>
      <div class="table-wrap">${taskTable(app, tasks)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Driver fleet</h3><p>GoodKota-owned and merchant-owned drivers share a common operational contract.</p></div></div>
      <div class="table-wrap">${driverTable(app, state.drivers)}</div>
    </section>
`;

  app.root.querySelectorAll("[data-assign-best]").forEach(button => {
    button.addEventListener("click", () => {
      const task = app.store.deliveryTask(button.dataset.assignBest);
      const recommendations = recommendDrivers(app.store.state, task);
      if (!recommendations.length) return alert("No eligible available driver is currently online for this delivery provider.");
      try {
        app.store.assignDriver(task.id, recommendations[0].driver.id, "delivery_ops_demo");
        app.toast(`${recommendations[0].driver.name} assigned to ${task.orderId}.`);
        app.render();
      } catch (error) { alert(error.message); }
    });
  });
}

function taskTable(app, tasks) {
  if (!tasks.length) return '<div class="empty">No delivery tasks yet. Place a Home Delivery order from Customer view.</div>';
  return `<table><thead><tr><th>Delivery</th><th>Outlet → Customer</th><th>Provider</th><th>Status</th><th>Driver</th><th>Fee</th><th>Dispatch</th></tr></thead><tbody>${tasks.map(task => {
    const order = app.store.state.orders.find(item => item.id === task.orderId);
    const outlet = app.store.outlet(task.outletId);
    const driver = task.assignedDriverId ? app.store.driver(task.assignedDriverId) : null;
    const recommendations = !driver && ["awaiting_prep", "ready_for_dispatch"].includes(task.status) ? recommendDrivers(app.store.state, task) : [];
    const best = recommendations[0];
    return `<tr>
      <td><strong>${escapeHtml(task.orderId)}</strong><div class="muted small">${formatDateTime(task.createdAt)}</div></td>
      <td><strong>${escapeHtml(outlet?.name || task.pickup.address)}</strong><div class="muted small">→ ${escapeHtml(order?.customer || "Customer")} · ${escapeHtml(task.dropoff.address)}</div></td>
      <td><span class="badge">${escapeHtml(task.providerType)}</span></td>
      <td><span class="badge ${task.status === "delivered" ? "ok" : "info"}">${escapeHtml(deliveryStatusLabel(task.status))}</span></td>
      <td>${driver ? `<strong>${escapeHtml(driver.name)}</strong><div class="muted small">${escapeHtml(driver.operatorType)}</div>` : '<span class="muted">Unassigned</span>'}</td>
      <td>${money(task.deliveryFee)}</td>
      <td>${driver
        ? '<span class="muted small">Assigned</span>'
        : task.status === "awaiting_prep"
          ? (best ? `<span class="muted small">Likely next: ${escapeHtml(best.driver.name)} · ~${estimateMinutes(best.distanceToPickupKm)} min from outlet</span>` : '<span class="muted small">Waiting for outlet</span>')
          : task.status === "ready_for_dispatch" && best
            ? `<button class="btn primary small" data-assign-best="${task.id}">Assign ${escapeHtml(best.driver.name)} · ~${estimateMinutes(best.distanceToPickupKm)} min away</button>`
            : task.status === "ready_for_dispatch"
              ? '<span class="muted small">No eligible driver online</span>'
              : '<span class="muted small">—</span>'}</td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

function driverTable(app, drivers) {
  return `<table><thead><tr><th>Driver</th><th>Fleet</th><th>Vehicle</th><th>Shift</th><th>Availability</th><th>Current job</th><th>Location snapshot</th></tr></thead><tbody>${drivers.map(driver => {
    const vehicle = app.store.vehicle(driver.vehicleId);
    const location = currentDriverLocation(app.store.state, driver.id);
    const task = driver.activeTaskId ? app.store.deliveryTask(driver.activeTaskId) : null;
    return `<tr>
      <td><strong>${escapeHtml(driver.name)}</strong><div class="muted small">⭐ ${Number(driver.rating || 0).toFixed(1)} · ${driver.completedDeliveries} completed</div></td>
      <td>${driver.operatorType === "goodkota" ? "GoodKota" : escapeHtml(app.store.merchant(driver.operatorId)?.name || "Merchant")}</td>
      <td>${escapeHtml(vehicle?.type || "—")}<div class="muted small">${escapeHtml(vehicle?.registration || "")}</div></td>
      <td><span class="badge ${driver.shiftStatus === "online" ? "ok" : ""}">${escapeHtml(driver.shiftStatus)}</span></td>
      <td>${escapeHtml(driver.availability)}</td>
      <td>${task ? `<strong>${escapeHtml(task.orderId)}</strong><div class="muted small">${escapeHtml(deliveryStatusLabel(task.status))}</div>` : "—"}</td>
      <td>${location ? formatDateTime(location.recordedAt) : "—"}</td>
    </tr>`;
  }).join("")}</tbody></table>`;
}
