import { escapeHtml, money, uid } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";
import { resolveArea } from "../services/location-service.js";

const DEMO_AREAS = ["Midrand", "Tembisa", "Centurion", "Ivory Park", "Johannesburg", "Pretoria", "Soweto", "Vereeniging"];
const COMPLIANCE_STATUSES = [
  { value: "pending_review", label: "Pending review" },
  { value: "compliant", label: "Compliant" },
  { value: "needs_action", label: "Needs action" },
  { value: "suspended", label: "Suspended" }
];

export function renderAdminView(app) {
  const { state } = app.store;
  const qualityAlerts = state.merchants.filter(merchant =>
    ["alert", "watch"].includes(merchant.qualitySummary.signal)
    || ["watch", "intervention", "probation", "suspended"].includes(merchant.qualityWorkflow.status)
  );

  app.root.innerHTML = `
    <section class="section-head">
      <div>
        <span class="eyebrow">GoodKota Office</span>
        <h2>Merchants</h2>
        <p>One merchant record contains the actual operating store, location and controls.</p>
      </div>
      <button class="btn primary" id="addMerchantButton">+ Add merchant</button>
    </section>

    <div class="metric-strip">
      <div class="stat"><span class="muted">Merchants</span><b>${state.merchants.length}</b></div>
      <div class="stat"><span class="muted">Active</span><b>${state.merchants.filter(merchant => merchant.enabled).length}</b></div>
      <div class="stat"><span class="muted">Quality attention</span><b>${qualityAlerts.length}</b></div>
    </div>

    <section class="section">
      <div class="section-head">
        <div><h3>Merchant list</h3><p>Select a merchant to manage all details.</p></div>
      </div>
      <div class="table-wrap">${merchantTable(state.merchants)}</div>
    </section>

    ${qualityAlerts.length ? `
      <section class="section">
        <div class="section-head"><div><h3>Quality attention</h3><p>Only merchants requiring review appear here.</p></div></div>
        <div class="table-wrap">${qualityTable(qualityAlerts)}</div>
      </section>` : ""}

    <section class="section" style="text-align:right">
      <button class="btn ghost small" id="resetDemo">Reset demo data</button>
    </section>`;

  app.root.querySelector("#addMerchantButton").addEventListener("click", () => openAddMerchant(app));
  app.root.querySelector("#resetDemo").addEventListener("click", () => {
    if (confirm("Reset GoodKota v4.3 to its original demo data?")) {
      app.store.reset();
      app.cart = [];
      app.render();
    }
  });

  app.root.querySelectorAll("[data-open-merchant]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openMerchantDetail(app, button.dataset.openMerchant);
    });
  });

  app.root.querySelectorAll("[data-open-merchant-row]").forEach(row => {
    const open = () => openMerchantDetail(app, row.dataset.openMerchantRow);
    row.addEventListener("click", event => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      open();
    });
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });

  app.root.querySelectorAll("[data-quality-action]").forEach(button => {
    button.addEventListener("click", () => applyQualityAction(app, button.dataset.merchantId, button.dataset.qualityAction));
  });
}

function merchantTable(merchants) {
  if (!merchants.length) return '<div class="empty">No merchants yet.</div>';

  return `<table>
    <thead><tr><th>Merchant</th><th>Location</th><th>Compliance</th><th>Quality</th><th>Status</th><th></th></tr></thead>
    <tbody>${merchants.map(merchant => {
      const compliance = complianceBadge(merchant.compliance?.status);
      const quality = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
      return `<tr class="merchant-row" data-open-merchant-row="${merchant.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(merchant.name)}">
        <td><strong>${escapeHtml(merchant.name)}</strong><div class="muted small">${escapeHtml(merchant.legalName)}</div></td>
        <td><strong>${escapeHtml(merchant.area || "")}</strong><div class="muted small">${escapeHtml(merchant.address || "")}</div></td>
        <td><span class="badge ${compliance.tone}">${compliance.label}</span></td>
        <td><span class="badge ${quality.tone}">${quality.label}</span></td>
        <td><span class="badge ${merchant.enabled === false ? "danger" : "ok"}">${merchant.enabled === false ? "Disabled" : "Active"}</span></td>
        <td><button class="btn ghost small" data-open-merchant="${merchant.id}">Open</button></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function qualityTable(merchants) {
  return `<table>
    <thead><tr><th>Merchant</th><th>Quality</th><th>Reason</th><th>Action</th></tr></thead>
    <tbody>${merchants.map(merchant => {
      const badge = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
      return `<tr>
        <td><strong>${escapeHtml(merchant.name)}</strong><div class="muted small">${escapeHtml(merchant.address || "")}</div></td>
        <td><span class="badge ${badge.tone}">${badge.label}</span><div class="muted small" style="margin-top:5px">⭐ ${merchant.qualitySummary.overall.toFixed(1)} · ${merchant.qualitySummary.count} verified</div></td>
        <td>${escapeHtml(merchant.qualitySummary.reason || merchant.qualityWorkflow.note || "Review required")}</td>
        <td><div class="row-actions">${qualityActions(merchant)}</div></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function qualityActions(merchant) {
  const id = merchant.id;
  const status = merchant.qualityWorkflow.status;
  if (status === "healthy" || status === "watch") return `<button class="btn danger small" data-merchant-id="${id}" data-quality-action="intervention">Start intervention</button>`;
  if (status === "intervention") return `<button class="btn small" data-merchant-id="${id}" data-quality-action="probation">Probation</button><button class="btn danger small" data-merchant-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "probation") return `<button class="btn ok small" data-merchant-id="${id}" data-quality-action="healthy">Return to healthy</button><button class="btn danger small" data-merchant-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "suspended") return `<button class="btn small" data-merchant-id="${id}" data-quality-action="probation">Re-open on probation</button>`;
  return "";
}

function openAddMerchant(app) {
  app.openDialog(`
    <div class="dialog-inner dialog-wide-inner">
      <div class="dialog-head"><div><span class="eyebrow">GoodKota Office</span><h2>Add merchant</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <p class="muted small">Create the operating store in one form. There is no separate outlet record.</p>
      <form id="merchantForm" class="form-grid">
        <div class="form-section"><h3 class="form-section-title">Business</h3></div>
        <label class="field">Trading name<input id="merchantName" required /></label>
        <label class="field">Legal name<input id="merchantLegalName" required /></label>
        <label class="field full">Contact email<input id="merchantEmail" type="email" /></label>

        <div class="form-section"><h3 class="form-section-title">Location & operations</h3></div>
        <label class="field">Area<select id="merchantArea">${areaOptions()}</select></label>
        <label class="field">Prep time (min)<input id="merchantPrep" type="number" min="1" value="20" required /></label>
        <label class="field full">Physical address<input id="merchantAddress" required autocomplete="street-address" /></label>
        <label class="field">Minimum order (R)<input id="merchantMinimum" type="number" min="0" step="1" value="30" required /></label>
        <label class="field">Delivery fee (R)<input id="merchantDeliveryFee" type="number" min="0" step="1" value="20" required /></label>
        <label class="field">Delivery radius (km)<input id="merchantRadius" type="number" min="0" step="1" value="7" /></label>
        <label class="field">Delivery provider<select id="merchantProvider"><option value="goodkota_fleet">GoodKota fleet</option><option value="merchant_fleet">Merchant fleet</option><option value="hybrid">Hybrid</option></select></label>
        <button class="btn primary field full">Create merchant</button>
      </form>
    </div>`);

  app.dialog.querySelector("#merchantForm").addEventListener("submit", event => {
    event.preventDefault();
    const area = resolveArea(app.dialog.querySelector("#merchantArea").value) || resolveArea("Midrand");
    const name = app.dialog.querySelector("#merchantName").value.trim();
    const legalName = app.dialog.querySelector("#merchantLegalName").value.trim();
    const address = app.dialog.querySelector("#merchantAddress").value.trim();
    if (!name || !legalName || !address) return alert("Trading name, legal name and physical address are required.");

    app.store.addMerchant({
      id: uid("merchant"),
      name,
      legalName,
      contact: { email: app.dialog.querySelector("#merchantEmail").value.trim() },
      area: area.label,
      address,
      latitude: area.lat,
      longitude: area.lng,
      prepMinutes: Number(app.dialog.querySelector("#merchantPrep").value) || 20,
      minOrder: Number(app.dialog.querySelector("#merchantMinimum").value) || 0,
      deliveryFee: Number(app.dialog.querySelector("#merchantDeliveryFee").value) || 0,
      delivery: {
        enabled: true,
        radiusKm: Number(app.dialog.querySelector("#merchantRadius").value) || 0,
        providerPreference: app.dialog.querySelector("#merchantProvider").value
      }
    });
    app.closeDialog();
    app.toast("Merchant created.");
    app.render();
  });
}

function openMerchantDetail(app, merchantId) {
  const merchant = app.store.merchant(merchantId);
  if (!merchant) return;
  const compliance = complianceBadge(merchant.compliance?.status);
  const quality = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
  const orders = app.store.state.orders.filter(order => order.merchantId === merchant.id);
  const products = app.store.state.products.filter(product => product.merchantId === merchant.id);

  app.openDialog(`
    <div class="dialog-inner dialog-wide-inner">
      <div class="dialog-head">
        <div><span class="eyebrow">Merchant</span><h2>${escapeHtml(merchant.name)}</h2><div class="order-meta"><span class="badge ${compliance.tone}">${compliance.label}</span><span class="badge ${quality.tone}">${quality.label}</span><span class="badge ${merchant.enabled ? "ok" : "danger"}">${merchant.enabled ? "Active" : "Disabled"}</span></div></div>
        <button class="icon-btn" data-close-dialog>✕</button>
      </div>

      <div class="detail-toolbar">
        <button class="btn primary small" id="editMerchantButton">Edit details</button>
        <button class="btn ${merchant.enabled ? "danger" : "ok"} small" id="toggleMerchantButton">${merchant.enabled ? "Disable merchant" : "Enable merchant"}</button>
      </div>

      <div class="compact-detail-grid">
        <div class="card soft"><span class="eyebrow">Location</span><strong>${escapeHtml(merchant.address || "—")}</strong><div class="muted small">${escapeHtml(merchant.area || "")}</div></div>
        <div class="card soft"><span class="eyebrow">Operations</span><div class="summary-line"><span>Prep</span><strong>${merchant.prepMinutes} min</strong></div><div class="summary-line"><span>Minimum</span><strong>${money(merchant.minOrder)}</strong></div><div class="summary-line"><span>Delivery</span><strong>${money(merchant.deliveryFee)}</strong></div></div>
        <div class="card soft"><span class="eyebrow">Delivery</span><div class="summary-line"><span>Provider</span><strong>${escapeHtml(providerLabel(merchant.delivery?.providerPreference))}</strong></div><div class="summary-line"><span>Radius</span><strong>${Number(merchant.delivery?.radiusKm || 0)} km</strong></div></div>
        <div class="card soft"><span class="eyebrow">Activity</span><div class="summary-line"><span>Orders</span><strong>${orders.length}</strong></div><div class="summary-line"><span>Menu items</span><strong>${products.length}</strong></div><div class="summary-line"><span>Verified ratings</span><strong>${merchant.qualitySummary.count}</strong></div></div>
      </div>

      <div class="detail-section">
        <h3>Compliance</h3>
        <div class="compliance-control">
          <label class="field">Status<select id="complianceStatus">${COMPLIANCE_STATUSES.map(item => `<option value="${item.value}" ${merchant.compliance?.status === item.value ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
          <label class="field full">Office note<textarea id="complianceNote" rows="2">${escapeHtml(merchant.compliance?.note || "")}</textarea></label>
          <button class="btn primary" id="saveComplianceButton">Save</button>
        </div>
      </div>

      <details class="details-disclosure">
        <summary>Settlement & business details</summary>
        <div style="margin-top:10px">
          <div class="summary-line"><span>Legal name</span><strong>${escapeHtml(merchant.legalName || "—")}</strong></div>
          <div class="summary-line"><span>Email</span><strong>${escapeHtml(merchant.contact?.email || "—")}</strong></div>
          <div class="summary-line"><span>Settlement</span><strong>${escapeHtml(merchant.settlement?.status || "not configured")}</strong></div>
          <div class="summary-line"><span>Gateway</span><strong>${escapeHtml(merchant.gatewayAccount?.status || "not configured")}</strong></div>
        </div>
      </details>
    </div>`);

  app.dialog.querySelector("#editMerchantButton").addEventListener("click", () => openEditMerchant(app, merchantId));
  app.dialog.querySelector("#toggleMerchantButton").addEventListener("click", () => {
    app.store.setMerchantEnabled(merchantId, !merchant.enabled);
    app.toast(merchant.enabled ? "Merchant enabled." : "Merchant disabled.");
    openMerchantDetail(app, merchantId);
    app.render();
  });
  app.dialog.querySelector("#saveComplianceButton").addEventListener("click", () => {
    app.store.setMerchantCompliance(
      merchantId,
      app.dialog.querySelector("#complianceStatus").value,
      app.dialog.querySelector("#complianceNote").value
    );
    app.toast("Compliance status updated.");
    openMerchantDetail(app, merchantId);
    app.render();
  });
}

function openEditMerchant(app, merchantId) {
  const merchant = app.store.merchant(merchantId);
  if (!merchant) return;
  const currentArea = DEMO_AREAS.includes(merchant.area) ? merchant.area : "Midrand";

  app.openDialog(`
    <div class="dialog-inner dialog-wide-inner">
      <div class="dialog-head"><div><span class="eyebrow">GoodKota Office</span><h2>Edit merchant</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="editMerchantForm" class="form-grid">
        <label class="field">Trading name<input id="editMerchantName" value="${escapeHtml(merchant.name)}" required /></label>
        <label class="field">Legal name<input id="editMerchantLegalName" value="${escapeHtml(merchant.legalName || "")}" required /></label>
        <label class="field full">Contact email<input id="editMerchantEmail" type="email" value="${escapeHtml(merchant.contact?.email || "")}" /></label>
        <label class="field">Area<select id="editMerchantArea">${areaOptions(currentArea)}</select></label>
        <label class="field">Prep time (min)<input id="editMerchantPrep" type="number" min="1" value="${Number(merchant.prepMinutes || 20)}" /></label>
        <label class="field full">Physical address<input id="editMerchantAddress" value="${escapeHtml(merchant.address || "")}" required /></label>
        <label class="field">Minimum order (R)<input id="editMerchantMinimum" type="number" min="0" step="1" value="${Number(merchant.minOrder || 0)}" /></label>
        <label class="field">Delivery fee (R)<input id="editMerchantDeliveryFee" type="number" min="0" step="1" value="${Number(merchant.deliveryFee || 0)}" /></label>
        <label class="field">Delivery radius (km)<input id="editMerchantRadius" type="number" min="0" step="1" value="${Number(merchant.delivery?.radiusKm || 0)}" /></label>
        <label class="field">Delivery provider<select id="editMerchantProvider">${providerOptions(merchant.delivery?.providerPreference)}</select></label>
        <button class="btn primary field full">Save changes</button>
      </form>
    </div>`);

  app.dialog.querySelector("#editMerchantForm").addEventListener("submit", event => {
    event.preventDefault();
    const area = resolveArea(app.dialog.querySelector("#editMerchantArea").value) || resolveArea("Midrand");
    app.store.updateMerchant(merchantId, {
      name: app.dialog.querySelector("#editMerchantName").value.trim(),
      legalName: app.dialog.querySelector("#editMerchantLegalName").value.trim(),
      contact: { email: app.dialog.querySelector("#editMerchantEmail").value.trim() },
      area: area.label,
      address: app.dialog.querySelector("#editMerchantAddress").value.trim(),
      latitude: area.lat,
      longitude: area.lng,
      prepMinutes: Number(app.dialog.querySelector("#editMerchantPrep").value) || 20,
      minOrder: Number(app.dialog.querySelector("#editMerchantMinimum").value) || 0,
      deliveryFee: Number(app.dialog.querySelector("#editMerchantDeliveryFee").value) || 0,
      delivery: {
        enabled: true,
        radiusKm: Number(app.dialog.querySelector("#editMerchantRadius").value) || 0,
        providerPreference: app.dialog.querySelector("#editMerchantProvider").value
      }
    });
    app.toast("Merchant details updated.");
    openMerchantDetail(app, merchantId);
    app.render();
  });
}

function applyQualityAction(app, merchantId, status) {
  const note = status === "healthy" ? "Quality returned to healthy monitoring" : `GoodKota Office set quality workflow to ${status}`;
  app.store.setQualityWorkflow(merchantId, status, note);
  app.toast("Quality workflow updated.");
  app.render();
}

function complianceBadge(status) {
  const map = {
    pending_review: { label: "Pending review", tone: "warn" },
    compliant: { label: "Compliant", tone: "ok" },
    needs_action: { label: "Needs action", tone: "danger" },
    suspended: { label: "Suspended", tone: "danger" }
  };
  return map[status] || map.pending_review;
}

function areaOptions(selected = "Midrand") {
  return DEMO_AREAS.map(area => `<option ${area === selected ? "selected" : ""}>${area}</option>`).join("");
}

function providerOptions(selected = "goodkota_fleet") {
  return [
    ["goodkota_fleet", "GoodKota fleet"],
    ["merchant_fleet", "Merchant fleet"],
    ["hybrid", "Hybrid"]
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function providerLabel(value) {
  return { goodkota_fleet: "GoodKota fleet", merchant_fleet: "Merchant fleet", hybrid: "Hybrid" }[value] || value || "Not set";
}
