import { escapeHtml, uid } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";
import { resolveArea } from "../services/location-service.js";

const DEMO_AREAS = ["Midrand", "Tembisa", "Centurion", "Ivory Park", "Johannesburg", "Pretoria", "Soweto", "Vereeniging"];

export function renderAdminView(app) {
  const { state } = app.store;
  const qualityAlerts = state.outlets.filter(outlet =>
    ["alert", "watch"].includes(outlet.qualitySummary.signal)
    || ["watch", "intervention", "probation", "suspended"].includes(outlet.qualityWorkflow.status)
  );

  app.root.innerHTML = `
    <section class="section-head">
      <div>
        <span class="eyebrow">GoodKota Office</span>
        <h2>Marketplace</h2>
        <p>Merchant onboarding and quality oversight.</p>
      </div>
      <button class="btn primary" id="addMerchantButton">+ Add merchant</button>
    </section>

    <div class="metric-strip">
      <div class="stat"><span class="muted">Merchants</span><b>${state.merchants.length}</b></div>
      <div class="stat"><span class="muted">Active outlets</span><b>${state.outlets.filter(outlet => outlet.enabled).length}</b></div>
      <div class="stat"><span class="muted">Quality attention</span><b>${qualityAlerts.length}</b></div>
    </div>

    <section class="section">
      <div class="section-head">
        <div><h3>Merchants</h3><p>Each merchant is a business. Its outlets remain separate physical locations.</p></div>
      </div>
      <div class="table-wrap">${merchantTable(app, state.merchants)}</div>
    </section>

    ${qualityAlerts.length ? `
      <section class="section">
        <div class="section-head"><div><h3>Quality attention</h3><p>Only outlets that need review appear here.</p></div></div>
        <div class="table-wrap">${qualityTable(qualityAlerts)}</div>
      </section>` : ""}

    <section class="section" style="text-align:right">
      <button class="btn ghost small" id="resetDemo">Reset demo data</button>
    </section>`;

  app.root.querySelector("#addMerchantButton").addEventListener("click", () => openAddMerchant(app));
  app.root.querySelector("#resetDemo").addEventListener("click", () => {
    if (confirm("Reset GoodKota v4 to its original demo data?")) {
      app.store.reset();
      app.cart = [];
      app.render();
    }
  });

  app.root.querySelectorAll("[data-open-merchant]").forEach(button => {
    button.addEventListener("click", () => openMerchantDetail(app, button.dataset.openMerchant));
  });

  app.root.querySelectorAll("[data-quality-action]").forEach(button => {
    button.addEventListener("click", () => applyQualityAction(app, button.dataset.outletId, button.dataset.qualityAction));
  });
}

function merchantTable(app, merchants) {
  if (!merchants.length) return '<div class="empty">No merchants yet.</div>';

  return `<table>
    <thead><tr><th>Merchant</th><th>Primary outlet</th><th>Settlement</th><th>Status</th><th></th></tr></thead>
    <tbody>${merchants.map(merchant => {
      const outlets = app.store.state.outlets.filter(outlet => outlet.merchantId === merchant.id);
      const primary = outlets.find(outlet => outlet.id === merchant.primaryOutletId) || outlets[0];
      return `<tr class="merchant-row">
        <td><strong>${escapeHtml(merchant.name)}</strong><div class="muted small">${escapeHtml(merchant.legalName)}</div></td>
        <td>${primary ? `<strong>${escapeHtml(primary.name)}</strong><div class="muted small">${escapeHtml(primary.address)}</div>` : '<span class="muted">No outlet</span>'}</td>
        <td><span class="badge ${merchant.settlement?.status === "verified" ? "ok" : "warn"}">${escapeHtml(merchant.settlement?.status || "not configured")}</span></td>
        <td><span class="badge ${merchant.enabled === false ? "danger" : "ok"}">${merchant.enabled === false ? "Disabled" : "Active"}</span></td>
        <td><button class="btn ghost small" data-open-merchant="${merchant.id}">Open</button></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function qualityTable(outlets) {
  return `<table>
    <thead><tr><th>Outlet</th><th>Quality</th><th>Reason</th><th>Action</th></tr></thead>
    <tbody>${outlets.map(outlet => {
      const badge = qualityBadge(outlet.qualityWorkflow.status, outlet.qualitySummary.signal);
      return `<tr>
        <td><strong>${escapeHtml(outlet.name)}</strong><div class="muted small">${escapeHtml(outlet.address)}</div></td>
        <td><span class="badge ${badge.tone}">${badge.label}</span><div class="muted small" style="margin-top:5px">⭐ ${outlet.qualitySummary.overall.toFixed(1)} · ${outlet.qualitySummary.count} verified</div></td>
        <td>${escapeHtml(outlet.qualitySummary.reason || outlet.qualityWorkflow.note || "Review required")}</td>
        <td><div class="row-actions">${qualityActions(outlet)}</div></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function qualityActions(outlet) {
  const id = outlet.id;
  const status = outlet.qualityWorkflow.status;
  if (status === "healthy" || status === "watch") return `<button class="btn danger small" data-outlet-id="${id}" data-quality-action="intervention">Start intervention</button>`;
  if (status === "intervention") return `<button class="btn small" data-outlet-id="${id}" data-quality-action="probation">Probation</button><button class="btn danger small" data-outlet-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "probation") return `<button class="btn ok small" data-outlet-id="${id}" data-quality-action="healthy">Return to healthy</button><button class="btn danger small" data-outlet-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "suspended") return `<button class="btn small" data-outlet-id="${id}" data-quality-action="probation">Re-open on probation</button>`;
  return "";
}

function openAddMerchant(app) {
  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><h2>Add merchant</h2><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="merchantOnboardingForm" class="form-grid">
        <div class="form-section">
          <h3 class="form-section-title">Business</h3>
        </div>
        <label class="field">Trading name<input id="merchantName" required autocomplete="organization" /></label>
        <label class="field">Legal business name<input id="merchantLegalName" required /></label>
        <label class="field full">Contact email<input id="merchantEmail" type="email" required autocomplete="email" /></label>

        <div class="form-section">
          <h3 class="form-section-title">Primary outlet</h3>
          <p class="form-section-note">The merchant and its first physical outlet are created together.</p>
        </div>
        <label class="field">Outlet name<input id="outletName" required /></label>
        <label class="field">Area<select id="outletArea">${areaOptions()}</select></label>
        <label class="field full">Physical address<input id="outletAddress" required autocomplete="street-address" /></label>
        <label class="field full">Delivery<select id="deliveryProvider">
          <option value="goodkota_fleet">GoodKota fleet</option>
          <option value="merchant_fleet">Merchant fleet</option>
        </select></label>
        <button class="btn primary field full">Create merchant</button>
      </form>
    </div>`);

  const nameInput = app.dialog.querySelector("#merchantName");
  const outletNameInput = app.dialog.querySelector("#outletName");
  let outletNameTouched = false;
  outletNameInput.addEventListener("input", () => { outletNameTouched = true; });
  nameInput.addEventListener("input", () => {
    if (!outletNameTouched) outletNameInput.value = nameInput.value;
  });

  app.dialog.querySelector("#merchantOnboardingForm").addEventListener("submit", event => {
    event.preventDefault();
    const area = resolveArea(app.dialog.querySelector("#outletArea").value) || resolveArea("Midrand");
    const merchantId = uid("merchant");
    const outletId = uid("outlet");
    const provider = app.dialog.querySelector("#deliveryProvider").value;

    app.store.addMerchantWithPrimaryOutlet({
      merchant: {
        id: merchantId,
        name: nameInput.value.trim(),
        legalName: app.dialog.querySelector("#merchantLegalName").value.trim(),
        contact: { email: app.dialog.querySelector("#merchantEmail").value.trim() },
        deliveryCapability: {
          ownDrivers: provider === "merchant_fleet",
          acceptsGoodKotaFleet: true,
          thirdPartyAllowed: true
        }
      },
      outlet: {
        id: outletId,
        name: outletNameInput.value.trim(),
        address: app.dialog.querySelector("#outletAddress").value.trim(),
        latitude: area.lat,
        longitude: area.lng,
        delivery: { enabled: true, radiusKm: 7, providerPreference: provider }
      }
    });

    app.closeDialog();
    app.toast("Merchant and primary outlet created.");
    app.render();
  });
}

function openMerchantDetail(app, merchantId) {
  const merchant = app.store.merchant(merchantId);
  if (!merchant) return;
  const outlets = app.store.state.outlets.filter(outlet => outlet.merchantId === merchantId);
  const primary = outlets.find(outlet => outlet.id === merchant.primaryOutletId) || outlets[0];

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><div><span class="eyebrow">Merchant</span><h2>${escapeHtml(merchant.name)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="summary-line"><span>Legal business</span><strong>${escapeHtml(merchant.legalName)}</strong></div>
      ${merchant.contact?.email ? `<div class="summary-line"><span>Contact</span><strong>${escapeHtml(merchant.contact.email)}</strong></div>` : ""}
      <div class="summary-line"><span>Settlement</span><strong>${escapeHtml(merchant.settlement?.status || "not configured")}</strong></div>

      <div class="detail-section">
        <div class="section-head"><div><h3>Outlets</h3><p>${outlets.length} physical ${outlets.length === 1 ? "outlet" : "outlets"}</p></div><button class="btn primary small" id="addOutletButton">+ Add another outlet</button></div>
        <div class="outlet-list">
          ${outlets.map(outlet => {
            const badge = qualityBadge(outlet.qualityWorkflow.status, outlet.qualitySummary.signal);
            return `<div class="outlet-card">
              <div>
                <div class="primary-outlet"><strong>${escapeHtml(outlet.name)}</strong>${outlet.id === primary?.id ? '<span class="badge">Primary</span>' : ""}<span class="badge ${badge.tone}">${badge.label}</span></div>
                <div class="muted small" style="margin-top:5px">${escapeHtml(outlet.address)}</div>
              </div>
              <span class="badge ${outlet.enabled ? "ok" : "danger"}">${outlet.enabled ? "Active" : "Disabled"}</span>
            </div>`;
          }).join("") || '<div class="empty">No outlets yet.</div>'}
        </div>
      </div>
    </div>`);

  app.dialog.querySelector("#addOutletButton").addEventListener("click", () => openAddOutlet(app, merchantId));
}

function openAddOutlet(app, merchantId) {
  const merchant = app.store.merchant(merchantId);
  if (!merchant) return;

  app.openDialog(`
    <div class="dialog-inner">
      <div class="dialog-head"><div><span class="eyebrow">${escapeHtml(merchant.name)}</span><h2>Add another outlet</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="addOutletForm" class="form-grid">
        <label class="field">Outlet name<input id="newOutletName" required /></label>
        <label class="field">Area<select id="newOutletArea">${areaOptions()}</select></label>
        <label class="field full">Physical address<input id="newOutletAddress" required /></label>
        <label class="field full">Delivery<select id="newOutletProvider">
          <option value="goodkota_fleet">GoodKota fleet</option>
          <option value="merchant_fleet">Merchant fleet</option>
        </select></label>
        <button class="btn primary field full">Add outlet</button>
      </form>
    </div>`);

  app.dialog.querySelector("#addOutletForm").addEventListener("submit", event => {
    event.preventDefault();
    const area = resolveArea(app.dialog.querySelector("#newOutletArea").value) || resolveArea("Midrand");
    const provider = app.dialog.querySelector("#newOutletProvider").value;
    app.store.addOutlet(merchantId, {
      id: uid("outlet"),
      name: app.dialog.querySelector("#newOutletName").value.trim(),
      address: app.dialog.querySelector("#newOutletAddress").value.trim(),
      latitude: area.lat,
      longitude: area.lng,
      delivery: { enabled: true, radiusKm: 7, providerPreference: provider }
    });
    app.closeDialog();
    app.toast("Outlet added.");
    app.render();
  });
}

function areaOptions() {
  return DEMO_AREAS.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join("");
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
