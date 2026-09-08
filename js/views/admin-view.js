import { escapeHtml, formatDateTime, fromCents, money, toCents, uid } from "../core/utils.js";
import { qualityBadge } from "../services/quality-service.js";
import { geocodeSouthAfricanAddress } from "../services/geocoding-service.js";

const COMPLIANCE_STATUSES = [
  { value: "pending_review", label: "Pending review" },
  { value: "compliant", label: "Compliant" },
  { value: "needs_action", label: "Needs action" },
  { value: "suspended", label: "Suspended" }
];
const COMMERCIAL_STATUSES = ["active", "review", "overdue", "suspended"];

export function renderAdminView(app) {
  const actor = app.platformActor("admin");
  if (!actor) {
    app.root.innerHTML = '<section class="section"><div class="notice danger"><strong>No active Yagoya Admin account.</strong><div class="small" style="margin-top:4px">An Owner must grant Admin authority before this workspace can operate.</div></div></section>';
    return;
  }
  const snapshot = app.repos.governance.adminOverview();
  const qualityAlerts = snapshot.qualityAlerts;
  const openCases = app.repos.governance.supportCases({ status: ["open", "in_progress"], limit: 50 }).items;
  const settlementAttention = snapshot.settlementAttention;
  const commercialAttention = snapshot.commercialAttention;
  const dispatchAttention = snapshot.dispatchAttention;
  const controls = app.repos.platform.controls();
  const merchantApplications = app.repos.applications.merchants({ status: "new", limit: 50 }).items;
  const driverApplications = app.repos.applications.drivers({ status: "new", limit: 50 }).items;
  const section = app.adminSection || "overview";

  app.root.innerHTML = `
    <section class="governance-hero admin-hero">
      <div>
        <span class="eyebrow">Yagoya Admin</span>
        <h2>Platform Operations</h2>
        <p>Keep merchants supported, compliant and operating. Company ownership and high-risk platform authority remain protected.</p>
      </div>
      <span class="status-pulse ${controls.maintenanceMode ? "danger" : "ok"}">${controls.maintenanceMode ? "Maintenance" : "Operational"}</span>
    </section>

    <div class="metric-strip governance-metrics">
      <div class="stat"><span class="muted">Open support</span><b>${openCases.length}</b></div>
      <div class="stat"><span class="muted">Quality attention</span><b>${qualityAlerts.length}</b></div>
      <div class="stat"><span class="muted">Settlement attention</span><b>${settlementAttention.length}</b></div>
      <div class="stat"><span class="muted">Dispatch attention</span><b>${dispatchAttention.length}</b></div>
      <div class="stat"><span class="muted">New applications</span><b>${merchantApplications.length + driverApplications.length}</b></div>
    </div>

    <nav class="section-tabs" aria-label="Yagoya Admin sections">
      ${adminTab("overview", "Overview", section)}
      ${adminTab("merchants", "Merchants", section)}
      ${adminTab("applications", "Applications", section, merchantApplications.length + driverApplications.length)}
      ${adminTab("drivers", "Drivers", section)}
      ${adminTab("orders", "Orders", section)}
      ${adminTab("promotions", "Promotions", section)}
      ${adminTab("support", "Support", section, openCases.length)}
      ${adminTab("communications", "Announcements", section)}
      ${adminTab("activity", "Activity", section)}
    </nav>

    ${section === "merchants" ? merchantsSection(app, qualityAlerts, commercialAttention) : ""}
    ${section === "applications" ? applicationsSection(app, merchantApplications, driverApplications) : ""}
    ${section === "drivers" ? driversSection(app) : ""}
    ${section === "orders" ? ordersSection(app) : ""}
    ${section === "promotions" ? promotionsSection(app) : ""}
    ${section === "support" ? supportSection(app, openCases) : ""}
    ${section === "communications" ? communicationsSection(app) : ""}
    ${section === "activity" ? activitySection(app) : ""}
    ${section === "overview" ? overviewSection(app, { openCases, qualityAlerts, settlementAttention, commercialAttention, dispatchAttention, summary: snapshot.summary }) : ""}
  `;

  bindSectionTabs(app);
  bindCommonAdminActions(app, actor);
}

function adminTab(value, label, current, count = null) {
  return `<button class="section-tab ${value === current ? "active" : ""}" data-admin-section="${value}">${label}${count ? `<span>${count}</span>` : ""}</button>`;
}

function bindSectionTabs(app) {
  app.root.querySelectorAll("[data-admin-section]").forEach(button => {
    button.addEventListener("click", () => {
      app.adminSection = button.dataset.adminSection;
      app.render();
      window.scrollTo(0, 0);
    });
  });
}

function overviewSection(app, data) {
  const attention = [
    ...data.openCases.slice(0, 2).map(item => ({ tone: item.priority === "high" ? "danger" : "warn", title: item.subject, detail: `${supportSource(app, item)} · ${item.status}`, action: "support" })),
    ...data.qualityAlerts.slice(0, 2).map(merchant => ({ tone: "danger", title: merchant.name, detail: merchant.qualityWorkflow.note || merchant.qualitySummary.reason || "Quality review required", action: "merchants" })),
    ...data.settlementAttention.slice(0, 1).map(merchant => ({ tone: "warn", title: merchant.name, detail: `Settlement ${merchant.settlement?.status || "not configured"}`, action: "merchants" })),
    ...data.dispatchAttention.slice(0, 1).map(task => ({ tone: "warn", title: task.orderId, detail: "Delivery ready and awaiting assignment", action: null }))
  ].slice(0, 5);

  return `
    <section class="section grid grid-2 governance-overview">
      <div class="card">
        <div class="section-head"><div><h3>Needs attention</h3><p>Exceptions before routine administration.</p></div></div>
        ${attention.length ? `<div class="attention-list">${attention.map(item => `
          <button class="attention-item" ${item.action ? `data-jump-admin="${item.action}"` : "disabled"}>
            <span class="status-dot ${item.tone}"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><b>›</b>
          </button>`).join("")}</div>` : '<div class="empty">No immediate platform exceptions.</div>'}
      </div>
      <div class="card">
        <span class="eyebrow">Authority boundary</span>
        <h3>Operate Yagoya. Do not own it.</h3>
        <p class="muted">Admins can support merchants, manage commercial and compliance status, publish notices and resolve operating issues. Admins cannot grant Owner authority or change protected company-wide controls.</p>
        <div class="integrity-strip"><span>Owner-controlled</span><strong>Authority · Maintenance · Ordering · Payments · Delivery</strong></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h3>Merchant network</h3><p>Current operating footprint.</p></div><button class="btn ghost small" data-jump-admin="merchants">Manage merchants</button></div>
      <div class="metric-strip">
        <div class="stat"><span class="muted">Merchants</span><b>${data.summary?.merchantCount || 0}</b></div>
        <div class="stat"><span class="muted">Active</span><b>${data.summary?.activeMerchants || 0}</b></div>
        <div class="stat"><span class="muted">Commercial attention</span><b>${data.commercialAttention.length}</b></div>
      </div>
    </section>`;
}

function merchantsSection(app, qualityAlerts, commercialAttention) {
  const enabled = app.repos.platform.controls().merchantOnboardingEnabled;
  return `
    <section class="section-head">
      <div><h2>Merchants</h2><p>Onboarding, compliance, commercial status and quality intervention.</p></div>
      <button class="btn primary" id="addMerchantButton" ${enabled ? "" : "disabled"}>+ Add merchant</button>
    </section>
    ${!enabled ? '<div class="notice">Merchant onboarding is paused by the Yagoya Owner.</div>' : ""}
    <div class="toolbar compact-toolbar"><input id="adminMerchantSearch" type="search" placeholder="Search merchant, area or address" value="${escapeHtml(app.adminMerchantQuery || "")}" /></div>
    <section class="section"><div class="table-wrap">${merchantTable(app.repos.merchants.list({ query: app.adminMerchantQuery || "", limit: 25, sortBy: "createdAt", direction: "desc" }).items)}</div><div class="muted small" style="margin-top:8px">Showing up to 25 matching merchants. Search narrows the operational view.</div></section>
    ${qualityAlerts.length || commercialAttention.length ? `
      <section class="section grid grid-2">
        <div class="card"><h3>Quality attention</h3>${qualityAlerts.length ? qualityTable(qualityAlerts) : '<div class="empty">No quality interventions.</div>'}</div>
        <div class="card"><h3>Commercial attention</h3>${commercialAttention.length ? commercialTable(commercialAttention) : '<div class="empty">No commercial exceptions.</div>'}</div>
      </section>` : ""}`;
}

function supportSection(app, openCases) {
  const cases = app.repos.governance.supportCases({ limit: 50 }).items;
  return `
    <section class="section-head"><div><h2>Support</h2><p>Cases remain visible across staff handovers until resolved.</p></div></section>
    <div class="metric-strip">
      <div class="stat"><span class="muted">Open</span><b>${openCases.filter(c => c.status === "open").length}</b></div>
      <div class="stat"><span class="muted">In progress</span><b>${openCases.filter(c => c.status === "in_progress").length}</b></div>
      <div class="stat"><span class="muted">High priority</span><b>${openCases.filter(c => c.priority === "high").length}</b></div>
    </div>
    <section class="section"><div class="table-wrap">${supportTable(app, cases)}</div></section>`;
}

function communicationsSection(app) {
  return `
    <section class="section-head"><div><h2>Announcements</h2><p>Target operational communication without relying on private chat groups.</p></div><button class="btn primary" id="newAnnouncementButton">New announcement</button></section>
    <section class="section"><div class="table-wrap">${announcementTable(app.repos.governance.announcements({ limit: 50 }).items)}</div></section>`;
}

function activitySection(app) {
  const events = app.repos.governance.audit({ visibility: "operations", limit: 80 }).items;
  return `
    <section class="section-head"><div><h2>Activity</h2><p>Operational history for continuity between Yagoya employees.</p></div></section>
    <section class="section"><div class="table-wrap">${auditTable(events)}</div></section>`;
}

function bindCommonAdminActions(app, actor) {
  app.root.querySelectorAll("[data-jump-admin]").forEach(button => button.addEventListener("click", () => {
    if (!button.dataset.jumpAdmin) return;
    app.adminSection = button.dataset.jumpAdmin;
    app.render();
  }));

  app.root.querySelector("#adminMerchantSearch")?.addEventListener("input", event => { app.adminMerchantQuery = event.currentTarget.value; app.render(); });
  app.root.querySelector("#adminOrderSearch")?.addEventListener("input", event => { app.adminOrderQuery = event.currentTarget.value; app.render(); });
  app.root.querySelector("#adminDriverSearch")?.addEventListener("input", event => { app.adminDriverQuery = event.currentTarget.value; app.render(); });
  app.root.querySelector("#addDriverButton")?.addEventListener("click", () => openAddDriver(app, actor));
  app.root.querySelector("#addPromotionButton")?.addEventListener("click", () => openPromotion(app, actor));
  app.root.querySelectorAll("[data-manage-driver]").forEach(button => button.addEventListener("click", () => openDriverAdmin(app, button.dataset.manageDriver, actor)));
  app.root.querySelectorAll("[data-manage-promo]").forEach(button => button.addEventListener("click", () => openPromotion(app, actor, button.dataset.managePromo)));
  app.root.querySelectorAll("[data-merchant-application]").forEach(button => button.addEventListener("click", () => openMerchantApplication(app, button.dataset.merchantApplication, actor)));
  app.root.querySelectorAll("[data-driver-application]").forEach(button => button.addEventListener("click", () => openDriverApplication(app, button.dataset.driverApplication, actor)));

  app.root.querySelector("#addMerchantButton")?.addEventListener("click", () => openAddMerchant(app, actor));
  app.root.querySelector("#newAnnouncementButton")?.addEventListener("click", () => openAnnouncementDialog(app, actor));

  app.root.querySelectorAll("[data-open-merchant]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    openMerchantDetail(app, button.dataset.openMerchant, actor);
  }));
  app.root.querySelectorAll("[data-open-merchant-row]").forEach(row => {
    const open = () => openMerchantDetail(app, row.dataset.openMerchantRow, actor);
    row.addEventListener("click", event => { if (!event.target.closest("button, a, input, select, textarea")) open(); });
    row.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(); } });
  });
  app.root.querySelectorAll("[data-quality-action]").forEach(button => button.addEventListener("click", () => {
    requestReason(app, {
      title: "Quality intervention",
      description: `Record why this merchant is moving to ${button.dataset.qualityAction}.`,
      confirmLabel: "Apply action",
      onConfirm: reason => {
        const merchant = app.repos.merchants.get(button.dataset.merchantId);
        app.commands.adminSetQuality(merchant.id, button.dataset.qualityAction, reason, actor);
        app.toast("Quality workflow updated.");
        app.render();
      }
    });
  }));
  app.root.querySelectorAll("[data-open-case]").forEach(button => button.addEventListener("click", () => openSupportCase(app, button.dataset.openCase, actor)));
  app.root.querySelectorAll("[data-toggle-announcement]").forEach(button => button.addEventListener("click", () => {
    app.commands.setAnnouncementActive(button.dataset.toggleAnnouncement, button.dataset.nextActive === "true", actor);
    app.toast("Announcement updated.");
    app.render();
  }));
}

function merchantTable(merchants) {
  if (!merchants.length) return '<div class="empty">No merchants yet.</div>';
  return `<table><thead><tr><th>Merchant</th><th>Location</th><th>Compliance</th><th>Commercial</th><th>Quality</th><th>Status</th><th></th></tr></thead><tbody>${merchants.map(merchant => {
    const compliance = complianceBadge(merchant.compliance?.status);
    const quality = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
    return `<tr class="merchant-row" data-open-merchant-row="${merchant.id}" tabindex="0" role="button">
      <td><strong>${escapeHtml(merchant.name)}</strong><div class="muted small">${escapeHtml(merchant.legalName)}</div></td>
      <td><strong>${escapeHtml(merchant.area || "")}</strong><div class="muted small">${escapeHtml(merchant.address || "")}</div></td>
      <td><span class="badge ${compliance.tone}">${compliance.label}</span></td>
      <td><span class="badge ${merchant.commercial?.status === "active" ? "ok" : "warn"}">${escapeHtml(merchant.commercial?.status || "active")}</span><div class="muted small">${escapeHtml(merchant.commercial?.plan || "Standard")}</div></td>
      <td><span class="badge ${quality.tone}">${quality.label}</span></td>
      <td><span class="badge ${merchant.enabled === false ? "danger" : "ok"}">${merchant.enabled === false ? "Disabled" : "Active"}</span></td>
      <td><button class="btn ghost small" data-open-merchant="${merchant.id}">Open</button></td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

function qualityTable(merchants) {
  return `<div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Quality</th><th>Action</th></tr></thead><tbody>${merchants.map(merchant => {
    const badge = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
    return `<tr><td><strong>${escapeHtml(merchant.name)}</strong><div class="muted small">${escapeHtml(merchant.qualityWorkflow.note || merchant.qualitySummary.reason || "Review required")}</div></td><td><span class="badge ${badge.tone}">${badge.label}</span></td><td><div class="row-actions">${qualityActions(merchant)}</div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function commercialTable(merchants) {
  return `<div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Status</th><th>Note</th></tr></thead><tbody>${merchants.map(m => `<tr><td><strong>${escapeHtml(m.name)}</strong></td><td><span class="badge warn">${escapeHtml(m.commercial?.status || "active")}</span></td><td>${escapeHtml(m.commercial?.note || "—")}</td></tr>`).join("")}</tbody></table></div>`;
}

function qualityActions(merchant) {
  const id = merchant.id;
  const status = merchant.qualityWorkflow.status;
  if (["healthy", "watch"].includes(status)) return `<button class="btn danger small" data-merchant-id="${id}" data-quality-action="intervention">Intervene</button>`;
  if (status === "intervention") return `<button class="btn small" data-merchant-id="${id}" data-quality-action="probation">Probation</button><button class="btn danger small" data-merchant-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "probation") return `<button class="btn ok small" data-merchant-id="${id}" data-quality-action="healthy">Healthy</button><button class="btn danger small" data-merchant-id="${id}" data-quality-action="suspended">Suspend</button>`;
  if (status === "suspended") return `<button class="btn small" data-merchant-id="${id}" data-quality-action="probation">Re-open</button>`;
  return "";
}

function supportTable(app, cases) {
  if (!cases.length) return '<div class="empty">No support cases.</div>';
  return `<table><thead><tr><th>Case</th><th>From</th><th>Priority</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${cases.map(item => `<tr>
    <td><strong>${escapeHtml(item.subject)}</strong><div class="muted small">${escapeHtml(item.message)}</div></td>
    <td>${escapeHtml(supportSource(app, item))}</td>
    <td><span class="badge ${item.priority === "high" ? "danger" : item.priority === "normal" ? "info" : ""}">${escapeHtml(item.priority)}</span></td>
    <td><span class="badge ${item.status === "resolved" ? "ok" : "warn"}">${escapeHtml(item.status.replaceAll("_", " "))}</span></td>
    <td>${formatDateTime(item.updatedAt || item.createdAt)}</td>
    <td><button class="btn ghost small" data-open-case="${item.id}">Open</button></td></tr>`).join("")}</tbody></table>`;
}

function supportSource(app, item) {
  if (item.merchantId) return app.repos.merchants.get(item.merchantId)?.name || item.sourceName || "Merchant";
  return item.sourceName || (item.source ? `${item.source.charAt(0).toUpperCase()}${item.source.slice(1)}` : "Stakeholder");
}

function announcementTable(items) {
  if (!items.length) return '<div class="empty">No announcements.</div>';
  return `<table><thead><tr><th>Announcement</th><th>Audience</th><th>Published</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr>
    <td><strong>${escapeHtml(item.title)}</strong><div class="muted small">${escapeHtml(item.message)}</div></td>
    <td>${escapeHtml(item.audience)}</td><td>${formatDateTime(item.createdAt)}</td>
    <td><span class="badge ${item.active !== false ? "ok" : ""}">${item.active !== false ? "Live" : "Closed"}</span></td>
    <td><button class="btn ghost small" data-toggle-announcement="${item.id}" data-next-active="${item.active === false}">${item.active === false ? "Re-open" : "Close"}</button></td>
  </tr>`).join("")}</tbody></table>`;
}

function auditTable(events) {
  if (!events.length) return '<div class="empty">No operational activity yet.</div>';
  return `<table><thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead><tbody>${events.map(item => `<tr><td>${formatDateTime(item.createdAt)}</td><td><strong>${escapeHtml(item.actorName)}</strong><div class="muted small">${escapeHtml(item.actorRole)}</div></td><td>${humanAction(item.action)}</td><td>${escapeHtml(item.targetType)} · ${escapeHtml(item.targetId)}</td><td>${escapeHtml(item.reason || "—")}</td></tr>`).join("")}</tbody></table>`;
}

function humanAction(action) { return String(action || "").replaceAll("_", " "); }

async function populateGeocode(app, prefix) {
  const address = app.dialog.querySelector(`#${prefix}Address`).value.trim();
  const status = app.dialog.querySelector(`#${prefix}LocationStatus`);
  const button = app.dialog.querySelector(`#${prefix}ResolveLocation`);
  button.disabled = true;
  status.textContent = "Finding location…";
  try {
    const match = await geocodeSouthAfricanAddress(address);
    app.dialog.querySelector(`#${prefix}Area`).value = match.area;
    app.dialog.querySelector(`#${prefix}Latitude`).value = match.latitude.toFixed(6);
    app.dialog.querySelector(`#${prefix}Longitude`).value = match.longitude.toFixed(6);
    status.textContent = `Location found · ${match.latitude.toFixed(5)}, ${match.longitude.toFixed(5)}`;
    status.className = "location-resolution ok";
  } catch (error) {
    status.textContent = error.message;
    status.className = "location-resolution danger";
  } finally { button.disabled = false; }
}

function locationFields(prefix, merchant = null) {
  return `
    <label class="field full">Physical address<input id="${prefix}Address" value="${escapeHtml(merchant?.address || "")}" required autocomplete="street-address" placeholder="Street, suburb, city" /></label>
    <div class="field full location-resolver"><button class="btn ghost" type="button" id="${prefix}ResolveLocation">Find location</button><span id="${prefix}LocationStatus" class="location-resolution">Enter any real South African address, then resolve it to coordinates.</span></div>
    <label class="field">Area / suburb<input id="${prefix}Area" value="${escapeHtml(merchant?.area || "")}" placeholder="e.g. Midrand" /></label>
    <label class="field">Latitude<input id="${prefix}Latitude" type="number" step="any" value="${merchant?.latitude ?? ""}" required /></label>
    <label class="field">Longitude<input id="${prefix}Longitude" type="number" step="any" value="${merchant?.longitude ?? ""}" required /></label>`;
}

function openAddMerchant(app, actor) {
  app.openDialog(`
    <div class="dialog-inner dialog-wide-inner">
      <div class="dialog-head"><div><span class="eyebrow">Yagoya Admin</span><h2>Add merchant</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="merchantForm" class="form-grid">
        <div class="form-section"><h3 class="form-section-title">Business</h3></div>
        <label class="field">Trading name<input id="merchantName" required /></label>
        <label class="field">Legal name<input id="merchantLegalName" required /></label>
        <label class="field full">Contact email<input id="merchantEmail" type="email" /></label>
        <div class="form-section"><h3 class="form-section-title">Location & operations</h3></div>
        ${locationFields("merchant")}
        <label class="field">Prep time (min)<input id="merchantPrep" type="number" min="1" value="20" required /></label>
        <label class="field">Minimum order (R)<input id="merchantMinimum" type="number" min="0" step="1" value="30" required /></label>
        <label class="field">Delivery fee (R)<input id="merchantDeliveryFee" type="number" min="0" step="1" value="20" required /></label>
        <label class="field">Delivery radius (km)<input id="merchantRadius" type="number" min="0" step="1" value="7" /></label>
        <label class="field">Delivery provider<select id="merchantProvider">${providerOptions()}</select></label>
        <button class="btn primary field full">Create merchant</button>
      </form>
    </div>`);
  app.dialog.querySelector("#merchantResolveLocation").addEventListener("click", () => populateGeocode(app, "merchant"));
  app.dialog.querySelector("#merchantForm").addEventListener("submit", event => {
    event.preventDefault();
    const latitude = Number(app.dialog.querySelector("#merchantLatitude").value);
    const longitude = Number(app.dialog.querySelector("#merchantLongitude").value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return alert("Resolve the merchant address or enter valid latitude and longitude.");
    const name = app.dialog.querySelector("#merchantName").value.trim();
    const legalName = app.dialog.querySelector("#merchantLegalName").value.trim();
    const address = app.dialog.querySelector("#merchantAddress").value.trim();
    if (!name || !legalName || !address) return alert("Trading name, legal name and physical address are required.");
    const merchant = { id: uid("merchant"), name, legalName, contact: { email: app.dialog.querySelector("#merchantEmail").value.trim() }, area: app.dialog.querySelector("#merchantArea").value.trim(), address, latitude, longitude, prepMinutes: Number(app.dialog.querySelector("#merchantPrep").value) || 20, minOrderCents: toCents(app.dialog.querySelector("#merchantMinimum").value), deliveryFeeCents: toCents(app.dialog.querySelector("#merchantDeliveryFee").value), delivery: { enabled: true, radiusKm: Number(app.dialog.querySelector("#merchantRadius").value) || 0, providerPreference: app.dialog.querySelector("#merchantProvider").value } };
    app.commands.adminAddMerchant(merchant, actor);
    app.closeDialog(); app.toast("Merchant created."); app.render();
  });
}

function openMerchantDetail(app, merchantId, actor) {
  const merchant = app.repos.merchants.get(merchantId); if (!merchant) return;
  const compliance = complianceBadge(merchant.compliance?.status);
  const quality = qualityBadge(merchant.qualityWorkflow.status, merchant.qualitySummary.signal);
  const orders = app.repos.orders.listForMerchant(merchant.id, { limit: 50 }).items;
  const products = app.repos.products.listForMerchant(merchant.id, { limit: 100 }).items;
  app.openDialog(`
    <div class="dialog-inner dialog-wide-inner">
      <div class="dialog-head"><div><span class="eyebrow">Merchant</span><h2>${escapeHtml(merchant.name)}</h2><div class="order-meta"><span class="badge ${compliance.tone}">${compliance.label}</span><span class="badge ${quality.tone}">${quality.label}</span><span class="badge ${merchant.enabled ? "ok" : "danger"}">${merchant.enabled ? "Active" : "Disabled"}</span></div></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <div class="detail-toolbar"><button class="btn primary small" id="editMerchantButton">Edit details</button><button class="btn ${merchant.enabled ? "danger" : "ok"} small" id="toggleMerchantButton">${merchant.enabled ? "Disable merchant" : "Enable merchant"}</button></div>
      <div class="compact-detail-grid">
        <div class="card soft"><span class="eyebrow">Location</span><strong>${escapeHtml(merchant.address || "—")}</strong><div class="muted small">${escapeHtml(merchant.area || "")}</div></div>
        <div class="card soft"><span class="eyebrow">Operations</span><div class="summary-line"><span>Prep</span><strong>${merchant.prepMinutes} min</strong></div><div class="summary-line"><span>Minimum</span><strong>${money(merchant.minOrderCents)}</strong></div><div class="summary-line"><span>Delivery</span><strong>${money(merchant.deliveryFeeCents)}</strong></div></div>
        <div class="card soft"><span class="eyebrow">Commercial</span><div class="summary-line"><span>Plan</span><strong>${escapeHtml(merchant.commercial?.plan || "Standard")}</strong></div><div class="summary-line"><span>Status</span><strong>${escapeHtml(merchant.commercial?.status || "active")}</strong></div></div>
        <div class="card soft"><span class="eyebrow">Activity</span><div class="summary-line"><span>Orders</span><strong>${orders.length}</strong></div><div class="summary-line"><span>Menu items</span><strong>${products.length}</strong></div><div class="summary-line"><span>Ratings</span><strong>${merchant.qualitySummary.count}</strong></div></div>
      </div>
      <div class="detail-section"><h3>Compliance</h3><div class="compliance-control"><label class="field">Status<select id="complianceStatus">${COMPLIANCE_STATUSES.map(item => `<option value="${item.value}" ${merchant.compliance?.status === item.value ? "selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field full">Admin note<textarea id="complianceNote" rows="2">${escapeHtml(merchant.compliance?.note || "")}</textarea></label><button class="btn primary" id="saveComplianceButton">Save</button></div></div>
      <div class="detail-section"><h3>Commercial status</h3><div class="compliance-control"><label class="field">Plan<input id="commercialPlan" value="${escapeHtml(merchant.commercial?.plan || "Standard")}" /></label><label class="field">Status<select id="commercialStatus">${COMMERCIAL_STATUSES.map(status => `<option ${merchant.commercial?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label><label class="field full">Note<textarea id="commercialNote" rows="2">${escapeHtml(merchant.commercial?.note || "")}</textarea></label><button class="btn primary" id="saveCommercialButton">Save</button></div></div>
      <details class="details-disclosure"><summary>Settlement & business details</summary><div style="margin-top:10px"><div class="summary-line"><span>Legal name</span><strong>${escapeHtml(merchant.legalName || "—")}</strong></div><div class="summary-line"><span>Email</span><strong>${escapeHtml(merchant.contact?.email || "—")}</strong></div><div class="summary-line"><span>Settlement</span><strong>${escapeHtml(merchant.settlement?.status || "not configured")}</strong></div><div class="summary-line"><span>Gateway</span><strong>${escapeHtml(merchant.gatewayAccount?.status || "not configured")}</strong></div></div></details>
    </div>`);
  app.dialog.querySelector("#editMerchantButton").addEventListener("click", () => openEditMerchant(app, merchantId, actor));
  app.dialog.querySelector("#toggleMerchantButton").addEventListener("click", () => requestReason(app, { title: merchant.enabled ? "Disable merchant" : "Enable merchant", description: "Record why Yagoya is changing this merchant's operating access.", confirmLabel: merchant.enabled ? "Disable" : "Enable", danger: merchant.enabled, onConfirm: reason => { const next = !merchant.enabled; app.commands.adminSetMerchantEnabled(merchantId, next, actor, reason); app.closeDialog(); app.toast(next ? "Merchant enabled." : "Merchant disabled."); app.render(); } }));
  app.dialog.querySelector("#saveComplianceButton").addEventListener("click", () => { const status = app.dialog.querySelector("#complianceStatus").value; const note = app.dialog.querySelector("#complianceNote").value; app.commands.adminSetCompliance(merchantId, status, note, actor, note || status); app.toast("Compliance updated."); openMerchantDetail(app, merchantId, actor); app.render(); });
  app.dialog.querySelector("#saveCommercialButton").addEventListener("click", () => { const status = app.dialog.querySelector("#commercialStatus").value; const plan = app.dialog.querySelector("#commercialPlan").value.trim(); const note = app.dialog.querySelector("#commercialNote").value; app.commands.adminSetCommercial(merchantId, { plan, status, note }, actor, note || `Commercial status ${status}`); app.toast("Commercial status updated."); openMerchantDetail(app, merchantId, actor); app.render(); });
}

function openEditMerchant(app, merchantId, actor) {
  const merchant = app.repos.merchants.get(merchantId); if (!merchant) return;
  app.openDialog(`
    <div class="dialog-inner dialog-wide-inner"><div class="dialog-head"><div><span class="eyebrow">Yagoya Admin</span><h2>Edit merchant</h2></div><button class="icon-btn" data-close-dialog>✕</button></div>
      <form id="editMerchantForm" class="form-grid">
        <label class="field">Trading name<input id="editMerchantName" value="${escapeHtml(merchant.name)}" required /></label><label class="field">Legal name<input id="editMerchantLegalName" value="${escapeHtml(merchant.legalName || "")}" required /></label><label class="field full">Contact email<input id="editMerchantEmail" type="email" value="${escapeHtml(merchant.contact?.email || "")}" /></label>
        ${locationFields("editMerchant", merchant)}
        <label class="field">Prep time (min)<input id="editMerchantPrep" type="number" min="1" value="${Number(merchant.prepMinutes || 20)}" /></label><label class="field">Minimum order (R)<input id="editMerchantMinimum" type="number" min="0" step="1" value="${fromCents(merchant.minOrderCents)}" /></label><label class="field">Delivery fee (R)<input id="editMerchantDeliveryFee" type="number" min="0" step="1" value="${fromCents(merchant.deliveryFeeCents)}" /></label><label class="field">Delivery radius (km)<input id="editMerchantRadius" type="number" min="0" step="1" value="${Number(merchant.delivery?.radiusKm || 0)}" /></label><label class="field">Delivery provider<select id="editMerchantProvider">${providerOptions(merchant.delivery?.providerPreference)}</select></label><button class="btn primary field full">Save changes</button>
      </form></div>`);
  app.dialog.querySelector("#editMerchantResolveLocation").addEventListener("click", () => populateGeocode(app, "editMerchant"));
  app.dialog.querySelector("#editMerchantForm").addEventListener("submit", event => { event.preventDefault(); const latitude = Number(app.dialog.querySelector("#editMerchantLatitude").value); const longitude = Number(app.dialog.querySelector("#editMerchantLongitude").value); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return alert("Resolve the address or enter valid coordinates."); const changes = { name: app.dialog.querySelector("#editMerchantName").value.trim(), legalName: app.dialog.querySelector("#editMerchantLegalName").value.trim(), contact: { email: app.dialog.querySelector("#editMerchantEmail").value.trim() }, area: app.dialog.querySelector("#editMerchantArea").value.trim(), address: app.dialog.querySelector("#editMerchantAddress").value.trim(), latitude, longitude, prepMinutes: Number(app.dialog.querySelector("#editMerchantPrep").value) || 20, minOrderCents: toCents(app.dialog.querySelector("#editMerchantMinimum").value), deliveryFeeCents: toCents(app.dialog.querySelector("#editMerchantDeliveryFee").value), delivery: { enabled: true, radiusKm: Number(app.dialog.querySelector("#editMerchantRadius").value) || 0, providerPreference: app.dialog.querySelector("#editMerchantProvider").value } }; app.commands.adminUpdateMerchant(merchantId, changes, actor); app.toast("Merchant details updated."); openMerchantDetail(app, merchantId, actor); app.render(); });
}

function openSupportCase(app, caseId, actor) {
  const item = app.repos.governance.supportCase(caseId); if (!item) return;
  const staff = app.repos.governance.staff({ active: true, limit: 50 }).items.filter(p => ["admin", "owner"].includes(p.role));
  const history = app.repos.governance.supportEvents(caseId, { limit: 50 }).items;
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Support case</span><h2>${escapeHtml(item.subject)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><div class="notice info">${escapeHtml(item.message)}</div>${history.length ? `<div class="timeline" style="margin-top:14px">${history.map(event => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(event.type.replaceAll("_", " "))}</strong><div class="muted small">${escapeHtml(event.actorName || event.actorType || "System")} · ${formatDateTime(event.createdAt)}</div>${event.note ? `<div class="small">${escapeHtml(event.note)}</div>` : ""}</div></div>`).join("")}</div>` : ""}<div class="form-grid" style="margin-top:14px"><label class="field">Status<select id="caseStatus"><option value="open" ${item.status === "open" ? "selected" : ""}>Open</option><option value="in_progress" ${item.status === "in_progress" ? "selected" : ""}>In progress</option><option value="resolved" ${item.status === "resolved" ? "selected" : ""}>Resolved</option></select></label><label class="field">Assigned to<select id="caseAssignee"><option value="">Unassigned</option>${staff.map(p => `<option value="${p.id}" ${item.assignedTo === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select></label><label class="field full">Resolution / handover note<textarea id="caseNote" rows="4">${escapeHtml(item.resolutionNote || "")}</textarea></label><button class="btn primary field full" id="saveCaseButton">Save case</button></div></div>`);
  app.dialog.querySelector("#saveCaseButton").addEventListener("click", () => { app.commands.updateSupportCase(caseId, { status: app.dialog.querySelector("#caseStatus").value, assignedTo: app.dialog.querySelector("#caseAssignee").value || null, resolutionNote: app.dialog.querySelector("#caseNote").value }, actor); app.closeDialog(); app.toast("Support case updated."); app.render(); });
}

function openAnnouncementDialog(app, actor) {
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Yagoya communication</span><h2>New announcement</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><form id="announcementForm" class="form-grid"><label class="field full">Title<input id="announcementTitle" required /></label><label class="field full">Message<textarea id="announcementMessage" rows="4" required></textarea></label><label class="field">Audience<select id="announcementAudience"><option value="all">Everyone</option><option value="customers">Customers</option><option value="merchants">Merchants</option><option value="drivers">Drivers</option><option value="operations">Delivery Ops</option><option value="internal">Yagoya staff</option></select></label><label class="field">Importance<select id="announcementSeverity"><option value="info">Information</option><option value="warn">Important</option><option value="danger">Critical</option></select></label><button class="btn primary field full">Publish</button></form></div>`);
  app.dialog.querySelector("#announcementForm").addEventListener("submit", event => { event.preventDefault(); app.commands.publishAnnouncement({ title: app.dialog.querySelector("#announcementTitle").value, message: app.dialog.querySelector("#announcementMessage").value, audience: app.dialog.querySelector("#announcementAudience").value, severity: app.dialog.querySelector("#announcementSeverity").value }, actor); app.closeDialog(); app.toast("Announcement published."); app.render(); });
}

function applicationsSection(app, merchantApplications, driverApplications) {
  const allMerchants = app.repos.applications.merchants({ limit: 25 }).items;
  const allDrivers = app.repos.applications.drivers({ limit: 25 }).items;
  return `
    <section class="section-head"><div><h2>Applications</h2><p>Public merchant and driver applications enter a durable Yagoya operating queue.</p></div></section>
    <section class="section grid grid-2">
      <div class="card"><div class="section-head"><div><h3>Merchant applications</h3><p>${merchantApplications.length} new</p></div></div>${applicationMerchantTable(allMerchants)}</div>
      <div class="card"><div class="section-head"><div><h3>Driver applications</h3><p>${driverApplications.length} new</p></div></div>${applicationDriverTable(allDrivers)}</div>
    </section>
    <section class="section card"><h3>Customer waitlist</h3><p class="muted small">Latest public interest captured from the Yagoya website.</p>${waitlistTable(app.repos.applications.waitlist({ limit: 25 }).items)}</section>`;
}

function applicationMerchantTable(items) {
  if (!items.length) return '<div class="empty">No merchant applications.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Business</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.businessName)}</strong><div class="muted small">${escapeHtml(item.contactName)} · ${escapeHtml(item.address)}</div></td><td><span class="badge ${item.status === "new" ? "warn" : item.status === "approved" ? "ok" : ""}">${escapeHtml(item.status)}</span></td><td><button class="btn ghost small" data-merchant-application="${item.id}">Open</button></td></tr>`).join("")}</tbody></table></div>`;
}

function applicationDriverTable(items) {
  if (!items.length) return '<div class="empty">No driver applications.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Driver</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><div class="muted small">${escapeHtml(item.operatingArea)} · ${escapeHtml(item.vehicleType)}</div></td><td><span class="badge ${item.status === "new" ? "warn" : item.status === "approved" ? "ok" : ""}">${escapeHtml(item.status)}</span></td><td><button class="btn ghost small" data-driver-application="${item.id}">Open</button></td></tr>`).join("")}</tbody></table></div>`;
}

function waitlistTable(items) {
  if (!items.length) return '<div class="empty">No waitlist entries.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Area</th><th>Joined</th></tr></thead><tbody>${items.map(item => `<tr><td>${escapeHtml(item.name || "—")}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.area || "—")}</td><td>${formatDateTime(item.createdAt)}</td></tr>`).join("")}</tbody></table></div>`;
}

function driversSection(app) {
  const query = String(app.adminDriverQuery || "").trim().toLowerCase();
  const page = app.repos.delivery.listDrivers({ limit: 50 });
  const drivers = query ? page.items.filter(driver => {
    const vehicle = app.repos.delivery.vehicle(driver.vehicleId);
    return `${driver.name} ${driver.phone} ${vehicle?.registration || ""} ${driver.operatorType}`.toLowerCase().includes(query);
  }) : page.items;
  return `
    <section class="section-head"><div><h2>Drivers</h2><p>Yagoya and merchant-fleet driver administration stays separate from live dispatch.</p></div><button class="btn primary" id="addDriverButton">+ Add driver</button></section>
    <div class="toolbar compact-toolbar"><input id="adminDriverSearch" type="search" placeholder="Search driver or registration" value="${escapeHtml(app.adminDriverQuery || "")}" /></div>
    <section class="section"><div class="table-wrap">${driverAdminTable(app, drivers)}</div><div class="muted small" style="margin-top:8px">Driver Ops remains separate: Delivery Ops assigns live jobs; Admin maintains people, vehicles and access.</div></section>`;
}

function driverAdminTable(app, drivers) {
  if (!drivers.length) return '<div class="empty">No matching drivers.</div>';
  return `<table><thead><tr><th>Driver</th><th>Vehicle</th><th>Operator</th><th>Shift</th><th>Status</th><th></th></tr></thead><tbody>${drivers.map(driver => { const vehicle = app.repos.delivery.vehicle(driver.vehicleId); return `<tr><td><strong>${escapeHtml(driver.name)}</strong><div class="muted small">${escapeHtml(driver.phone || "")}</div></td><td>${escapeHtml(vehicle?.type || "—")}<div class="muted small">${escapeHtml(vehicle?.registration || "")}</div></td><td>${escapeHtml(driver.operatorType)}</td><td>${escapeHtml(driver.shiftStatus)}</td><td><span class="badge ${driver.enabled !== false ? "ok" : "danger"}">${driver.enabled !== false ? "Active" : "Disabled"}</span></td><td><button class="btn ghost small" data-manage-driver="${driver.id}">Manage</button></td></tr>`; }).join("")}</tbody></table>`;
}

function ordersSection(app) {
  const page = app.repos.orders.listAll({ query: app.adminOrderQuery || "", limit: 50 });
  return `
    <section class="section-head"><div><h2>Orders</h2><p>Bounded cross-merchant oversight for support and operational investigation.</p></div></section>
    <div class="toolbar compact-toolbar"><input id="adminOrderSearch" type="search" placeholder="Search order, customer or merchant" value="${escapeHtml(app.adminOrderQuery || "")}" /></div>
    <section class="section"><div class="table-wrap">${adminOrdersTable(app, page.items)}</div><div class="muted small" style="margin-top:8px">Showing up to 50 matching orders. Production queries use indexed cursors rather than loading the full order history.</div></section>`;
}

function adminOrdersTable(app, orders) {
  if (!orders.length) return '<div class="empty">No matching orders.</div>';
  return `<table><thead><tr><th>Order</th><th>Merchant</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>${orders.map(order => `<tr><td><strong>${escapeHtml(order.orderNumber || order.id)}</strong>${order.scheduledFor ? `<div class="muted small">Scheduled ${formatDateTime(order.scheduledFor)}</div>` : ""}</td><td>${escapeHtml(app.repos.merchants.get(order.merchantId)?.name || "—")}</td><td>${escapeHtml(order.customer || "—")}</td><td>${money(order.amountCents)}</td><td><span class="badge ${order.status === "completed" ? "ok" : "info"}">${escapeHtml(order.status)}</span></td><td>${formatDateTime(order.createdAt)}</td></tr>`).join("")}</tbody></table>`;
}

function promotionsSection(app) {
  const promos = app.repos.promotions.list({ limit: 50 }).items;
  return `
    <section class="section-head"><div><h2>Promotions</h2><p>Yagoya-wide promotion codes with controlled status and minimum-spend rules.</p></div><button class="btn primary" id="addPromotionButton">+ New promotion</button></section>
    <section class="section"><div class="table-wrap">${promotionTable(promos)}</div></section>`;
}

function promotionTable(items) {
  if (!items.length) return '<div class="empty">No promotions configured.</div>';
  return `<table><thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.code)}</strong></td><td>${Number(item.discountPercent || 0)}%</td><td>${money(item.minCents || 0)}</td><td><span class="badge ${item.status === "active" ? "ok" : ""}">${escapeHtml(item.status)}</span></td><td><button class="btn ghost small" data-manage-promo="${item.id}">Manage</button></td></tr>`).join("")}</tbody></table>`;
}

function openAddDriver(app, actor, source = null) {
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Yagoya Admin</span><h2>Add driver</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><form id="addDriverForm" class="form-grid"><label class="field">Name<input id="driverName" value="${escapeHtml(source?.name || "")}" required /></label><label class="field">Phone<input id="driverPhone" value="${escapeHtml(source?.phone || "")}" required /></label><label class="field">Email<input id="driverEmail" type="email" value="${escapeHtml(source?.email || "")}" /></label><label class="field">Vehicle type<input id="driverVehicle" value="${escapeHtml(source?.vehicleType || "Motorbike")}" required /></label><label class="field">Registration<input id="driverRegistration" value="${escapeHtml(source?.registration || "")}" /></label><label class="field">Operator<select id="driverOperator"><option value="yagoya">Yagoya fleet</option><option value="merchant">Merchant fleet</option></select></label><button class="btn primary field full">Add driver</button></form></div>`);
  app.dialog.querySelector("#addDriverForm").addEventListener("submit", event => { event.preventDefault(); try { const driver = app.commands.adminAddDriver({ name: app.dialog.querySelector("#driverName").value, phone: app.dialog.querySelector("#driverPhone").value, email: app.dialog.querySelector("#driverEmail").value, vehicleType: app.dialog.querySelector("#driverVehicle").value, registration: app.dialog.querySelector("#driverRegistration").value, operatorType: app.dialog.querySelector("#driverOperator").value, operatorId: app.dialog.querySelector("#driverOperator").value === "yagoya" ? "yagoya" : null }, actor); if (source?.id) app.commands.adminUpdateApplication("driver", source.id, { status: "approved", note: `Onboarded as ${driver.name}` }, actor); app.closeDialog(); app.toast("Driver added."); app.adminSection = "drivers"; app.render(); } catch (error) { alert(error.message); } });
}

function openDriverAdmin(app, driverId, actor) {
  const driver = app.repos.delivery.driver(driverId); if (!driver) return;
  const vehicle = app.repos.delivery.vehicle(driver.vehicleId);
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Driver administration</span><h2>${escapeHtml(driver.name)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><div class="form-grid"><label class="field">Name<input id="editDriverName" value="${escapeHtml(driver.name)}" /></label><label class="field">Phone<input id="editDriverPhone" value="${escapeHtml(driver.phone || "")}" /></label><label class="field">Vehicle<input id="editDriverVehicle" value="${escapeHtml(vehicle?.type || "")}" /></label><label class="field">Registration<input id="editDriverRegistration" value="${escapeHtml(vehicle?.registration || "")}" /></label><label class="field">Status<select id="editDriverEnabled"><option value="true" ${driver.enabled !== false ? "selected" : ""}>Active</option><option value="false" ${driver.enabled === false ? "selected" : ""}>Disabled</option></select></label><label class="field full">Reason<textarea id="editDriverReason" rows="3" placeholder="Reason for this administration change" required></textarea></label><button class="btn primary field full" id="saveDriverAdmin">Save</button></div></div>`);
  app.dialog.querySelector("#saveDriverAdmin").addEventListener("click", () => { const reason = app.dialog.querySelector("#editDriverReason").value.trim(); if (!reason) return alert("A reason is required."); app.commands.adminUpdateDriver(driverId, { name: app.dialog.querySelector("#editDriverName").value, phone: app.dialog.querySelector("#editDriverPhone").value, vehicleType: app.dialog.querySelector("#editDriverVehicle").value, registration: app.dialog.querySelector("#editDriverRegistration").value, enabled: app.dialog.querySelector("#editDriverEnabled").value === "true" }, actor, reason); app.closeDialog(); app.toast("Driver updated."); app.render(); });
}

function openPromotion(app, actor, promoId = null) {
  const promo = promoId ? app.repos.promotions.get(promoId) : null;
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Promotion</span><h2>${promo ? escapeHtml(promo.code) : "New promotion"}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><form id="promotionForm" class="form-grid"><label class="field">Code<input id="promoCode" value="${escapeHtml(promo?.code || "")}" ${promo ? "readonly" : ""} required /></label><label class="field">Discount %<input id="promoDiscount" type="number" min="0" max="100" value="${Number(promo?.discountPercent || 10)}" required /></label><label class="field">Minimum spend (R)<input id="promoMinimum" type="number" min="0" step="1" value="${fromCents(promo?.minCents || 0)}" /></label><label class="field">Status<select id="promoStatus"><option value="active" ${promo?.status !== "inactive" ? "selected" : ""}>Active</option><option value="inactive" ${promo?.status === "inactive" ? "selected" : ""}>Inactive</option></select></label><button class="btn primary field full">Save promotion</button></form></div>`);
  app.dialog.querySelector("#promotionForm").addEventListener("submit", event => { event.preventDefault(); const data = { code: app.dialog.querySelector("#promoCode").value.trim().toUpperCase(), discountPercent: Number(app.dialog.querySelector("#promoDiscount").value), minCents: toCents(app.dialog.querySelector("#promoMinimum").value), status: app.dialog.querySelector("#promoStatus").value }; try { if (promo) app.commands.adminUpdatePromotion(promo.id, data, actor); else app.commands.adminAddPromotion(data, actor); app.closeDialog(); app.toast("Promotion saved."); app.render(); } catch (error) { alert(error.message); } });
}

function openMerchantApplication(app, id, actor) {
  const item = app.repos.applications.merchant(id); if (!item) return;
  app.openDialog(`<div class="dialog-inner dialog-wide-inner"><div class="dialog-head"><div><span class="eyebrow">Merchant application</span><h2>${escapeHtml(item.businessName)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><form id="approveMerchantApplication" class="form-grid"><label class="field">Trading name<input id="applicationMerchantName" value="${escapeHtml(item.businessName)}" required /></label><label class="field">Contact name<input value="${escapeHtml(item.contactName)}" readonly /></label><label class="field">Email<input id="applicationMerchantEmail" value="${escapeHtml(item.email)}" /></label><label class="field">Phone<input value="${escapeHtml(item.phone)}" readonly /></label>${locationFields("applicationMerchant", { address: item.address, area: item.area, latitude: item.latitude, longitude: item.longitude })}<label class="field full">Application note<textarea rows="3" readonly>${escapeHtml(item.note || "")}</textarea></label><div class="inline-actions field full"><button class="btn primary" type="submit">Approve & onboard</button><button class="btn ghost" type="button" id="holdMerchantApplication">Keep under review</button><button class="btn danger" type="button" id="declineMerchantApplication">Decline</button></div></form></div>`);
  app.dialog.querySelector("#applicationMerchantResolveLocation")?.addEventListener("click", () => populateGeocode(app, "applicationMerchant"));
  app.dialog.querySelector("#approveMerchantApplication").addEventListener("submit", event => { event.preventDefault(); const latitude = Number(app.dialog.querySelector("#applicationMerchantLatitude").value); const longitude = Number(app.dialog.querySelector("#applicationMerchantLongitude").value); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return alert("Resolve the physical address before onboarding."); try { const merchant = app.commands.adminAddMerchant({ name: app.dialog.querySelector("#applicationMerchantName").value.trim(), legalName: app.dialog.querySelector("#applicationMerchantName").value.trim(), contact: { email: app.dialog.querySelector("#applicationMerchantEmail").value.trim() }, area: app.dialog.querySelector("#applicationMerchantArea").value.trim(), address: app.dialog.querySelector("#applicationMerchantAddress").value.trim(), latitude, longitude, prepMinutes: 20, minOrderCents: 3000, deliveryFeeCents: 2000, delivery: { enabled: true, radiusKm: 7, providerPreference: "yagoya_fleet" } }, actor); app.commands.adminUpdateApplication("merchant", id, { status: "approved", note: `Onboarded as ${merchant.name}` }, actor); app.closeDialog(); app.toast("Merchant approved and onboarded."); app.adminSection = "merchants"; app.render(); } catch (error) { alert(error.message); } });
  app.dialog.querySelector("#holdMerchantApplication")?.addEventListener("click", () => { app.commands.adminUpdateApplication("merchant", id, { status: "review", note: "Application retained for review" }, actor); app.closeDialog(); app.render(); });
  app.dialog.querySelector("#declineMerchantApplication")?.addEventListener("click", () => { app.commands.adminUpdateApplication("merchant", id, { status: "declined", note: "Application declined" }, actor); app.closeDialog(); app.render(); });
}

function openDriverApplication(app, id, actor) {
  const item = app.repos.applications.driver(id); if (!item) return;
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Driver application</span><h2>${escapeHtml(item.name)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><div class="summary-line"><span>Phone</span><strong>${escapeHtml(item.phone)}</strong></div><div class="summary-line"><span>Email</span><strong>${escapeHtml(item.email)}</strong></div><div class="summary-line"><span>Area</span><strong>${escapeHtml(item.operatingArea)}</strong></div><div class="summary-line"><span>Vehicle</span><strong>${escapeHtml(item.vehicleType)} ${escapeHtml(item.registration || "")}</strong></div>${item.note ? `<div class="notice" style="margin-top:12px">${escapeHtml(item.note)}</div>` : ""}<div class="inline-actions" style="margin-top:16px"><button class="btn primary" id="onboardDriverApplication">Approve & onboard</button><button class="btn ghost" id="holdDriverApplication">Keep under review</button><button class="btn danger" id="declineDriverApplication">Decline</button></div></div>`);
  app.dialog.querySelector("#onboardDriverApplication")?.addEventListener("click", () => openAddDriver(app, actor, item));
  app.dialog.querySelector("#holdDriverApplication")?.addEventListener("click", () => { app.commands.adminUpdateApplication("driver", id, { status: "review", note: "Application retained for review" }, actor); app.closeDialog(); app.render(); });
  app.dialog.querySelector("#declineDriverApplication")?.addEventListener("click", () => { app.commands.adminUpdateApplication("driver", id, { status: "declined", note: "Application declined" }, actor); app.closeDialog(); app.render(); });
}

function requestReason(app, { title, description, confirmLabel = "Confirm", danger = false, onConfirm }) {
  app.openDialog(`<div class="dialog-inner"><div class="dialog-head"><div><span class="eyebrow">Controlled intervention</span><h2>${escapeHtml(title)}</h2></div><button class="icon-btn" data-close-dialog>✕</button></div><p class="muted">${escapeHtml(description)}</p><label class="field">Reason<textarea id="interventionReason" rows="4" placeholder="Why is this action necessary?" required></textarea></label><button class="btn ${danger ? "danger" : "primary"} customer-primary-action" id="confirmIntervention">${escapeHtml(confirmLabel)}</button></div>`);
  app.dialog.querySelector("#confirmIntervention").addEventListener("click", () => { const reason = app.dialog.querySelector("#interventionReason").value.trim(); if (!reason) return alert("A reason is required for this intervention."); onConfirm(reason); });
}

function complianceBadge(status) {
  const map = { pending_review: { label: "Pending review", tone: "warn" }, compliant: { label: "Compliant", tone: "ok" }, needs_action: { label: "Needs action", tone: "danger" }, suspended: { label: "Suspended", tone: "danger" } };
  return map[status] || map.pending_review;
}
function providerOptions(selected = "yagoya_fleet") { return [["yagoya_fleet", "Yagoya fleet"], ["merchant_fleet", "Merchant fleet"], ["hybrid", "Hybrid"]].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join(""); }
