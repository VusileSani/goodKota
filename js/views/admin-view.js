import { escapeHtml, money } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";

export function renderAdminView(app) {
  const { state } = app.store;
  const qualityAlerts = state.outlets.filter(outlet => ["alert","watch"].includes(outlet.qualitySummary.signal) || ["watch","intervention","probation","suspended"].includes(outlet.qualityWorkflow.status));
  const verifiedMerchants = state.merchants.filter(merchant => merchant.gatewayAccount?.status === "verified").length;
  const paidValue = state.payments.filter(payment => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);

  app.root.innerHTML = `
    <section class="section-head">
      <div><span class="eyebrow">GoodKota Office</span><h2>Marketplace control centre</h2><p>Quality, outlets, merchant settlement, delivery governance and platform configuration.</p></div>
      <button class="btn ghost" id="resetDemo">Reset demo data</button>
    </section>

    <div class="grid grid-4">
      <div class="stat"><span class="muted">Merchants</span><b>${state.merchants.length}</b></div>
      <div class="stat"><span class="muted">Active outlets</span><b>${state.outlets.filter(outlet => outlet.enabled).length}</b></div>
      <div class="stat"><span class="muted">Quality attention</span><b>${qualityAlerts.length}</b></div>
      <div class="stat"><span class="muted">Demo paid value</span><b>${money(paidValue)}</b></div>
    </div>

    <section class="section grid grid-2">
      <div class="card">
        <span class="eyebrow">Payment gateway</span>
        <h3>${escapeHtml(state.platform.paymentGateway.provider)}</h3>
        <div class="summary-line"><span>Status</span><strong>${state.platform.paymentGateway.enabled ? "Enabled" : "Disabled"}</strong></div>
        <div class="summary-line"><span>Configured by</span><strong>GoodKota Office</strong></div>
        <div class="summary-line"><span>Food proceeds</span><strong>Direct to merchant</strong></div>
        <div class="summary-line"><span>Delivery fee</span><strong>Allocated by fulfilment provider</strong></div>
        <div class="summary-line"><span>Verified merchants</span><strong>${verifiedMerchants}/${state.merchants.length}</strong></div>
        <p class="muted small">Production gateway choice remains an adapter decision. The order/payment domain does not depend on one provider.</p>
      </div>
      <div class="card soft">
        <span class="eyebrow">Architectural invariant</span>
        <h3>Browser success never marks an order paid.</h3>
        <p class="muted">In production, a trusted server-side gateway webhook must verify the payment before GoodKota transitions payment_pending → paid → order_submitted.</p>
      </div>
    </section>

    <section class="section grid grid-2">
      <div class="card">
        <span class="eyebrow">Delivery governance</span>
        <h3>Hybrid fulfilment is now a first-class platform domain.</h3>
        <div class="summary-line"><span>Drivers</span><strong>${state.drivers.length}</strong></div>
        <div class="summary-line"><span>Delivery tasks</span><strong>${state.deliveryTasks.length}</strong></div>
        <div class="summary-line"><span>Provider model</span><strong>${escapeHtml(state.platform.delivery.operatingModel)}</strong></div>
        <p class="muted small">GoodKota-owned, merchant-owned and future third-party fleets share the same delivery-task contract.</p>
      </div>
      <div class="card soft">
        <span class="eyebrow">Privacy invariant</span>
        <h3>Operational location, not permanent surveillance.</h3>
        <p class="muted">Driver tracking is modelled as a current location snapshot plus durable job events. Production should stop tracking outside active shift/job conditions and apply short retention to raw location data.</p>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Quality intervention queue</h3><p>Verified ratings create operational signals. Human oversight controls interventions and consequences.</p></div></div>
      <div class="table-wrap">${qualityTable(app, qualityAlerts)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Merchant settlement onboarding</h3><p>Merchants supply accurate business/bank details; GoodKota controls the gateway configuration.</p></div></div>
      <div class="table-wrap">${merchantTable(state.merchants)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Outlet registry</h3><p>Physical outlets own geographic coordinates, operating data and quality status.</p></div></div>
      <div class="table-wrap">${outletTable(state.outlets)}</div>
    </section>`;

  app.root.querySelector("#resetDemo").addEventListener("click", () => {
    if (confirm("Reset Foundation v3 to its original demo data?")) {
      app.store.reset();
      app.cart = [];
      app.render();
    }
  });

  app.root.querySelectorAll("[data-quality-action]").forEach(button => {
    button.addEventListener("click", () => applyQualityAction(app, button.dataset.outletId, button.dataset.qualityAction));
  });
}

function qualityTable(app, outlets) {
  if (!outlets.length) return '<div class="empty">No outlets require quality attention.</div>';
  return `<table><thead><tr><th>Outlet</th><th>Verified quality</th><th>Low-rating rate</th><th>Signal</th><th>Workflow</th><th>Action</th></tr></thead><tbody>${outlets.map(outlet => {
    const badge = qualityBadge(outlet.qualityWorkflow.status, outlet.qualitySummary.signal);
    return `<tr>
      <td><strong>${escapeHtml(outlet.name)}</strong><div class="muted small">${escapeHtml(outlet.address)}</div></td>
      <td>⭐ ${outlet.qualitySummary.overall.toFixed(1)}<div class="muted small">Food ${outlet.qualitySummary.food.toFixed(1)} · Service ${outlet.qualitySummary.service.toFixed(1)} · ${outlet.qualitySummary.count} ratings</div></td>
      <td>${Math.round(outlet.qualitySummary.lowRatingRate * 100)}%</td>
      <td><span class="badge ${badge.tone}">${escapeHtml(outlet.qualitySummary.signal)}</span><div class="muted small">${escapeHtml(outlet.qualitySummary.reason)}</div></td>
      <td><strong>${escapeHtml(outlet.qualityWorkflow.status)}</strong><div class="muted small">${escapeHtml(outlet.qualityWorkflow.note || "")}</div></td>
      <td><div class="row-actions">${qualityActions(outlet)}</div></td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

function qualityActions(outlet) {
  const id = outlet.id;
  const status = outlet.qualityWorkflow.status;
  if (status === "healthy" || status === "watch") return `<button class="btn danger small" data-outlet-id="${id}" data-quality-action="intervention">Start intervention</button>`;
  if (status === "intervention") return `<button class="btn small" data-outlet-id="${id}" data-quality-action="probation">Move to probation</button><button class="btn danger small" data-outlet-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "probation") return `<button class="btn ok small" data-outlet-id="${id}" data-quality-action="healthy">Return to healthy</button><button class="btn danger small" data-outlet-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "suspended") return `<button class="btn small" data-outlet-id="${id}" data-quality-action="probation">Re-open on probation</button>`;
  return "";
}

function merchantTable(merchants) {
  return `<table><thead><tr><th>Merchant</th><th>Gateway account</th><th>Bank</th><th>Account</th><th>Settlement status</th></tr></thead><tbody>${merchants.map(merchant => `<tr>
    <td><strong>${escapeHtml(merchant.name)}</strong><div class="muted small">${escapeHtml(merchant.legalName)}</div></td>
    <td>${escapeHtml(merchant.gatewayAccount?.id || "—")}<div class="muted small">${escapeHtml(merchant.gatewayAccount?.status || "not configured")}</div></td>
    <td>${escapeHtml(merchant.settlement.bankName || "—")}</td><td>${escapeHtml(merchant.settlement.maskedAccount || "—")}</td>
    <td><span class="badge ${merchant.settlement.status === "verified" ? "ok" : "warn"}">${escapeHtml(merchant.settlement.status)}</span></td>
  </tr>`).join("")}</tbody></table>`;
}

function outletTable(outlets) {
  return `<table><thead><tr><th>Outlet</th><th>Coordinates</th><th>Prep</th><th>Quality workflow</th><th>Discovery</th></tr></thead><tbody>${outlets.map(outlet => `<tr>
    <td><strong>${escapeHtml(outlet.name)}</strong><div class="muted small">${escapeHtml(outlet.address)}</div></td>
    <td>${outlet.latitude.toFixed(4)}, ${outlet.longitude.toFixed(4)}</td><td>${outlet.prepMinutes} min</td>
    <td>${escapeHtml(outlet.qualityWorkflow.status)}</td><td>${outlet.qualityWorkflow.status === "suspended" ? '<span class="badge danger">Hidden</span>' : '<span class="badge ok">Eligible</span>'}</td>
  </tr>`).join("")}</tbody></table>`;
}

function applyQualityAction(app, outletId, action) {
  const notes = {
    intervention: "GoodKota Office intervention opened with outlet owner",
    probation: "Corrective action completed; monitoring next verified orders",
    healthy: "Outlet returned to GoodKota Standard after review",
    suspended: "Outlet suspended from customer discovery pending quality resolution"
  };
  app.store.setQualityWorkflow(outletId, action, notes[action] || "");
  app.toast(`Quality workflow updated to ${action}.`);
  app.render();
}
