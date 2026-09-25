import { STANDARD } from "../data/seed.js";
import { isPick, submitApplication, reviewApplication, saveMerchant, reviewMerchant, setMerchantStatus, setQuality, transitionOrder, updateCase, orderReport } from "../core/operations.js";
import { merchantExperience } from "../core/feedback.js";
import { mountPayfastSetup } from "./payfast-setup.js";

const tabs = ["overview", "applications", "merchants", "orders", "quality", "support", "reports", "payments", "activity"];
const date = value => value ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";
const statusBadge = value => `<span class="badge ${value === "active" || value === "approved" || value === "resolved" || value === "completed" ? "green" : value === "paused" || value === "declined" || value === "cancelled" || value === "intervention" ? "red" : "amber"}">${value.replaceAll("_", " ")}</span>`;
const row = (title, detail, badge, action) => `<div class="work-row"><div class="work-row-copy"><strong>${title}</strong><p>${detail}</p></div><div class="work-row-actions">${badge || ""}${action || ""}</div></div>`;
const empty = text => `<div class="empty">${text}</div>`;

export function renderAdminWorkspace({store, app, modal, render, showToast, esc, money, directionsUrl, choiceText}) {
  const state = store.state;
  const tab = tabs.includes(state.adminTab) ? state.adminTab : "overview";
  const pending = state.applications.filter(a => ["new", "review"].includes(a.status)).length;
  const openCases = state.supportCases.filter(c => c.status !== "resolved").length;
  const newOrders = state.orders.filter(o => o.status === "new").length;
  const lowFeedback = state.merchants.filter(m => merchantExperience(state, m.id).tone === "red").length;
  const e = esc;
  const open = (html, callback) => {
    modal.innerHTML = html;
    modal.showModal();
    modal.querySelector("[data-close]")?.addEventListener("click", () => modal.close());
    callback?.();
  };
  const formValue = (form, key) => String(new FormData(form).get(key) || "").trim();
  const perform = action => { try { action(); modal.close(); render(); } catch (error) { showToast(error.message); } };
  const heading = (eyebrow, title, subtitle = "") => `<div class="page-title compact"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>`;
  const metrics = [
    [pending, "Applications to review", "applications"],
    [newOrders, "New pickup orders", "orders"],
    [openCases, "Open support cases", "support"],
    [state.merchants.filter(m => m.listingStatus === "active").length, "Active listings", "merchants"]
  ];
  const overview = () => `${heading("Operations", "Today at GoodKota", "Keep applications, listings and pickup orders moving.")}
    <div class="metric-grid">${metrics.map(([value,label,id]) => `<button class="metric metric-action" data-admin-tab="${id}"><div class="value">${value}</div><div class="label">${label} →</div></button>`).join("")}</div>
    <div class="work-grid section"><section class="panel"><div class="section-head"><h2>Needs attention</h2></div>
      ${pending ? row("Merchant applications", `${pending} waiting for a decision`, statusBadge("review"), `<button class="btn ghost small" data-admin-tab="applications">Review</button>`) : ""}
      ${newOrders ? row("New orders", `${newOrders} waiting for merchant acceptance`, statusBadge("new"), `<button class="btn ghost small" data-admin-tab="orders">View</button>`) : ""}
      ${openCases ? row("Support cases", `${openCases} unresolved`, statusBadge("open"), `<button class="btn ghost small" data-admin-tab="support">View</button>`) : ""}
      ${lowFeedback ? row("Pickup experience", `${lowFeedback} spot(s) need quality review`, statusBadge("intervention"), `<button class="btn ghost small" data-admin-tab="quality">Review</button>`) : ""}
      ${!pending && !newOrders && !openCases && !lowFeedback ? empty("All clear for now.") : ""}</section>
      <section class="panel"><h2>Recently changed</h2>${state.events.slice(-5).reverse().map(ev => row(e(ev.type.replaceAll("_", " ")), date(ev.at), "", "")).join("") || empty("Actions will appear here.")}</section></div>`;
  const applications = () => `${heading("Intake", "Merchant applications", "Review details, approve a listing into setup, or decline with a reason.")}
    <div class="work-toolbar"><button class="btn primary small" id="newApplication">+ Add application</button></div>
    <section class="panel">${state.applications.map(a => row(e(a.businessName), `${e(a.area)} · ${e(a.contactName)} · ${date(a.createdAt)}${a.reviewReason ? ` · ${e(a.reviewReason)}` : ""}`, statusBadge(a.status), `<button class="btn ghost small" data-application="${e(a.id)}">${["new","review"].includes(a.status) ? "Review" : "Details"}</button>`)).join("") || empty("No applications yet. Merchants can apply from the customer account screen.")}</section>`;
  const merchants = () => `${heading("Listings", "Merchant management", "Edit operating details and control which spots can take orders.")}
    <div class="work-toolbar"><input id="adminMerchantSearch" type="search" placeholder="Search a merchant or area" value="${e(state.adminMerchantSearch || "")}" aria-label="Search merchants"></div>
    <section class="panel" id="adminMerchantRows">${merchantRows()}</section>`;
  const merchantRows = () => state.merchants.filter(m => `${m.name} ${m.area}`.toLowerCase().includes((state.adminMerchantSearch || "").toLowerCase())).map(m => row(e(m.name), `${e(m.area)} · ${e(m.address)} · ${m.menu.length} menu items`, statusBadge(m.listingStatus), `<button class="btn ghost small" data-manage-merchant="${e(m.id)}">Manage</button>`)).join("") || empty("No matching merchants.");
  const orders = () => `${heading("Pickup", "Order oversight", "Inspect order contents and handle exceptions.")}
    <div class="work-toolbar"><select id="adminOrderFilter" aria-label="Filter orders">${["all","new","accepted","ready","completed","cancelled"].map(s => `<option value="${s}" ${state.adminOrderFilter === s ? "selected" : ""}>${s === "all" ? "All orders" : s}</option>`).join("")}</select></div>
    <section class="panel">${state.orders.filter(o => !state.adminOrderFilter || state.adminOrderFilter === "all" || o.status === state.adminOrderFilter).map(o => row(e(o.id), `${e(store.merchant(o.merchantId)?.name || "Merchant") } · ${e(o.customer)} · ${date(o.createdIso)} · ${money(o.total)}`, statusBadge(o.status), `<button class="btn ghost small" data-admin-order="${e(o.id)}">Details</button>`)).join("") || empty("No orders in this view.")}</section>`;
  const quality = () => `${heading("GoodKota Standard", "Quality review", "Record evidence for each check and act on quality concerns.")}
    <section class="panel">${state.merchants.map(m => { const signal = merchantExperience(state, m.id); return row(e(m.name), `${STANDARD.filter(check => m.standard?.[check.id]).length}/5 checks · Pickup feedback: ${signal.count ? `${signal.counts.amazing} amazing, ${signal.counts.good} good, ${signal.counts.average} average` : "none"} · ${e(m.quality?.note || "No quality note")}`, `${statusBadge(m.quality?.status || "healthy")} ${signal.count >= 3 ? `<span class="badge ${signal.tone}">${signal.label}</span>` : ""} ${isPick(m) ? `<span class="badge orange">Pick</span>` : ""}`, `<button class="btn ghost small" data-quality="${e(m.id)}">Review</button>`); }).join("")}</section>`;
  const support = () => `${heading("Help desk", "Support cases", "Record a handover note before changing a case status.")}
    <section class="panel">${state.supportCases.map(c => row(e(c.subject), `${e(store.merchant(c.merchantId)?.name || "Merchant")} · ${e(c.message)}${c.note ? ` · ${e(c.note)}` : ""}`, statusBadge(c.status), `<button class="btn ghost small" data-case="${e(c.id)}">Open case</button>`)).join("") || empty("No support cases. Merchants can open one from their workspace.")}</section>`;
  const today = new Date().toISOString().slice(0,10);
  const firstDay = `${today.slice(0,8)}01`;
  const reports = () => `${heading("Operations", "Order report", "Order value is an estimate of placed pickup orders; payment is collected by the merchant.")}
    <form class="panel report-form" id="reportForm"><label>From<input name="from" type="date" value="${e(state.reportFrom || firstDay)}" required></label><label>To<input name="to" type="date" value="${e(state.reportTo || today)}" required></label><label>Merchant<select name="merchantId"><option value="">All merchants</option>${state.merchants.map(m => `<option value="${e(m.id)}" ${state.reportMerchantId === m.id ? "selected" : ""}>${e(m.name)}</option>`).join("")}</select></label><button class="btn primary" type="submit">Run report</button></form>
    <div id="reportResults">${reportResult()}</div>`;
  const reportResult = () => {
    if (!state.reportFrom || !state.reportTo) return "";
    let result;
    try { result = orderReport(state, {from: state.reportFrom, to: state.reportTo, merchantId: state.reportMerchantId}); }
    catch (error) { return `<p class="muted">${e(error.message)}</p>`; }
    return `<div class="metric-grid section"><article class="metric"><div class="value">${result.count}</div><div class="label">Placed orders (excluding cancelled)</div></article><article class="metric"><div class="value">${result.cancelled}</div><div class="label">Cancelled orders</div></article><article class="metric"><div class="value">${money(result.orderValue)}</div><div class="label">Order value · unpaid on platform</div></article></div><div class="work-toolbar"><button class="btn ghost small" id="exportReport">Export CSV</button></div>
      <section class="panel">${result.orders.map(o => row(e(o.id), `${date(o.createdIso)} · ${e(store.merchant(o.merchantId)?.name || "Merchant")} · ${e(o.customer)} · ${money(o.total)}`, statusBadge(o.status), "")).join("") || empty("No orders in this range.")}</section>`;
  };
  const activity = () => `${heading("Audit", "Activity", "Recent actions recorded in this browser.")}<section class="panel">${state.events.slice().reverse().map(ev => row(e(ev.type.replaceAll("_", " ")), `${date(ev.at)} · ${e(JSON.stringify(ev.payload))}`, "", "")).join("") || empty("No activity yet.")}</section>`;
  const payments = () => `${heading("Provider", "Payments", "Prepare PayFast without exposing credentials in this browser.")}<div id="payfastSetup"></div>`;
  const screens = {overview, applications, merchants, orders, quality, support, reports, payments, activity};
  app.innerHTML = `<nav class="work-tabs" aria-label="Management sections">${tabs.map(id => `<button class="${tab === id ? "active" : ""}" data-admin-tab="${id}">${id === "overview" ? "Overview" : id[0].toUpperCase() + id.slice(1)}${id === "applications" && pending ? `<small>${pending}</small>` : ""}</button>`).join("")}</nav>${screens[tab]()}`;
  if (tab === "payments") mountPayfastSetup(app.querySelector("#payfastSetup"), {esc:e, showToast, merchants:state.merchants});

  app.querySelectorAll("[data-admin-tab]").forEach(button => button.addEventListener("click", () => { state.adminTab = button.dataset.adminTab; store.save(); render(); }));
  app.querySelector("#adminMerchantSearch")?.addEventListener("input", event => { state.adminMerchantSearch = event.target.value; store.save(); app.querySelector("#adminMerchantRows").innerHTML = merchantRows(); bindMerchantRows(); });
  app.querySelector("#adminOrderFilter")?.addEventListener("change", event => { state.adminOrderFilter = event.target.value; store.save(); render(); });

  const applicationForm = (a, isNew) => `<form id="applicationReviewForm" class="modal-body editor-form"><div class="modal-head"><div><div class="eyebrow">${isNew ? "New lead" : "Application"}</div><h2>${isNew ? "Add application" : "Review merchant"}</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div>
    <div class="editor-pair"><label>Trading name<input name="businessName" required value="${e(a.businessName || "")}"></label><label>Area<input name="area" required value="${e(a.area || "")}"></label></div><label>Pickup address<input name="address" required value="${e(a.address || "")}"></label>
    <div class="editor-pair"><label>Contact name<input name="contactName" required value="${e(a.contactName || "")}"></label><label>Phone<input name="phone" type="tel" required value="${e(a.phone || "")}"></label></div><label>Email<input name="email" type="email" required value="${e(a.email || "")}"></label><label>Notes<textarea name="note" rows="2">${e(a.note || "")}</textarea></label>
    ${isNew ? `<button class="btn primary" type="submit">Save application</button>` : ["new","review"].includes(a.status) ? `<label>Decision note or decline reason<textarea name="reason" rows="2" placeholder="What was checked, or why declined">${e(a.reviewReason || "")}</textarea></label><div class="action-row"><button class="btn primary" type="button" data-decision="approved">Approve into setup</button><button class="btn ghost" type="button" data-decision="review">Hold for review</button><button class="btn dark" type="button" data-decision="declined">Decline</button></div><p class="muted">Approval creates an offline listing. Add a menu, complete quality checks and activate it separately.</p>` : `<p class="muted">${e(a.reviewReason || "Decision recorded.")}</p>`}</form>`;
  const openApplication = (a, isNew = false) => open(applicationForm(a, isNew), () => {
    const form = modal.querySelector("form");
    if (isNew) form.addEventListener("submit", event => { event.preventDefault(); if (form.reportValidity()) perform(() => submitApplication(store, Object.fromEntries(new FormData(form)))); });
    else form.querySelectorAll("[data-decision]").forEach(button => button.addEventListener("click", () => {
      if (!form.reportValidity()) return;
      const fields = Object.fromEntries(new FormData(form));
      perform(() => reviewApplication(store, a.id, button.dataset.decision, fields, fields.reason));
    }));
  });
  app.querySelector("#newApplication")?.addEventListener("click", () => openApplication({}, true));
  app.querySelectorAll("[data-application]").forEach(button => button.addEventListener("click", () => openApplication(state.applications.find(a => a.id === button.dataset.application))));

  function bindMerchantRows() {
    app.querySelectorAll("[data-manage-merchant]").forEach(button => button.addEventListener("click", () => {
      const m = store.merchant(button.dataset.manageMerchant);
      const standardCount = STANDARD.filter(check => m.standard?.[check.id]).length;
      const availableCount = m.menu.filter(item => item.available).length;
      const addressReady = Boolean(m.address?.trim());
      const qualityReady = m.quality?.status !== "intervention";
      const ready = standardCount === STANDARD.length && addressReady && availableCount > 0 && qualityReady;
      const primaryStatus = m.listingStatus === "active" ? "paused" : "active";
      const primaryLabel = m.listingStatus === "active" ? "Pause listing" : m.listingStatus === "paused" ? "Resume listing" : "Activate listing";
      const secondaryStatus = m.listingStatus === "review" ? "paused" : "review";
      const secondaryLabel = secondaryStatus === "paused" ? "Pause listing" : "Return to review";
      const readiness = [
        [standardCount === STANDARD.length, `GoodKota Standard · ${standardCount}/${STANDARD.length}`],
        [addressReady, "Pickup address saved"],
        [availableCount > 0, `${availableCount} available menu item${availableCount === 1 ? "" : "s"}`],
        [qualityReady, "Quality clear for trading"]
      ];
      open(`<div class="modal-body merchant-manager"><div class="modal-head"><div><div class="eyebrow">Merchant management</div><h2>${e(m.name)}</h2></div><button type="button" class="modal-close" data-close aria-label="Close">×</button></div>
        <form id="manageMerchantForm" class="editor-form compact-form"><section class="merchant-editor-section"><h3>Merchant details</h3>
          <label>Trading name<input name="name" required value="${e(m.name)}"></label>
          <div class="editor-pair"><label>Area<input name="area" required value="${e(m.area)}"></label><label>Prep time (min)<input name="prepMinutes" type="number" min="1" max="180" required value="${m.prepMinutes}"></label></div>
          <div class="editor-pair"><label>Contact name<input name="contactName" value="${e(m.contact?.name)}"></label><label>Contact phone<input name="phone" type="tel" value="${e(m.contact?.phone)}"></label></div>
          <label>Contact email<input name="email" type="email" value="${e(m.contact?.email)}"></label></section>
          <section class="merchant-editor-section pickup-section"><div class="merchant-section-title"><h3>Pickup location</h3><a href="${directionsUrl(m)}" target="_blank" rel="noopener noreferrer" class="text-link" data-pickup-maps>Open Maps ↗</a></div>
          <label>Pickup address<input name="address" required value="${e(m.address)}" autocomplete="street-address"></label></section>
          <button class="btn primary save-merchant" type="submit">Save changes</button></form>
        <section class="merchant-status-card" aria-labelledby="tradingStatusHeading"><div class="merchant-section-title"><h3 id="tradingStatusHeading">Trading status</h3>${statusBadge(m.listingStatus)}</div>
          <p class="merchant-status-note">${m.listingStatus === "active" ? "Listed. The merchant can open or close orders." : m.listingStatus === "paused" ? "Listing paused. Resume when the spot is ready." : "Listing in review. Complete the checks before activation."}</p>
          <ul class="readiness-list">${readiness.map(([passed, label]) => `<li class="${passed ? "ready" : "missing"}"><span aria-hidden="true">${passed ? "✓" : "•"}</span>${e(label)}</li>`).join("")}</ul>
          <button class="text-link readiness-link" type="button" data-open-quality>Review the five checks ↗</button>
          <label class="status-reason">Reason for status change<textarea name="statusReason" rows="2" required placeholder="A short note for the activity log"></textarea></label>
          <button type="button" class="btn ${primaryStatus === "active" ? "primary" : "dark"} status-primary" data-listing-status="${primaryStatus}" ${primaryStatus === "active" && !ready ? "disabled title=\"Complete the readiness checklist first\"" : ""}>${primaryLabel}</button>
          <details class="status-more"><summary>Other status action</summary><button type="button" class="btn ghost small" data-listing-status="${secondaryStatus}">${secondaryLabel}</button></details>
        </section></div>`, () => {
        const form = modal.querySelector("#manageMerchantForm");
        form.addEventListener("submit", event => { event.preventDefault(); if (form.reportValidity()) perform(() => saveMerchant(store, m.id, Object.fromEntries(new FormData(form)))); });
        const address = form.querySelector('[name="address"]');
        const area = form.querySelector('[name="area"]');
        const maps = modal.querySelector("[data-pickup-maps]");
        const updateMaps = () => { maps.href = directionsUrl({address: address.value.trim(), area: area.value.trim()}); };
        address.addEventListener("input", updateMaps);
        area.addEventListener("input", updateMaps);
        const reason = modal.querySelector('[name="statusReason"]');
        modal.querySelectorAll("[data-listing-status]").forEach(action => action.addEventListener("click", () => {
          if (!reason.reportValidity()) return;
          perform(() => setMerchantStatus(store, m.id, action.dataset.listingStatus, reason.value));
        }));
        modal.querySelector("[data-open-quality]").addEventListener("click", () => { modal.close(); state.adminTab = "quality"; store.save(); render(); });
      });
    }));
  }
  bindMerchantRows();

  app.querySelectorAll("[data-admin-order]").forEach(button => button.addEventListener("click", () => {
    const o = state.orders.find(order => order.id === button.dataset.adminOrder);
    const m = store.merchant(o.merchantId);
    open(`<div class="modal-body editor-form"><div class="modal-head"><div><div class="eyebrow">Pickup order · ${e(o.status)}</div><h2>${e(o.id)}</h2></div><button class="modal-close" data-close aria-label="Close">×</button></div><p>${e(m?.name || "Merchant")} · ${date(o.createdIso)} · ${money(o.total)}</p>
      <p><strong>${e(o.customer)}</strong><br>${e(o.contact?.phone)} · ${e(o.contact?.email)}<br>Payment: pay on collection · ${e(o.paymentStatus || "unpaid")}${o.experience ? `<br>Pickup experience: ${e(o.experience.value)}` : ""}</p><div class="order-items">${o.items.map(line => `<div>${line.qty} × ${e(line.name || store.product(line.productId)?.name || "Item")} · ${money((line.unitPrice || 0) * line.qty)}<small>${e(choiceText(line))}</small></div>`).join("")}</div>
      ${m ? `<a class="text-link" href="${directionsUrl(m)}" target="_blank" rel="noopener noreferrer">Pickup directions ↗</a>` : ""}${o.cancelReason ? `<p class="muted">Cancellation: ${e(o.cancelReason)}</p>` : ""}
      ${["new","accepted"].includes(o.status) ? `<label>Cancellation reason<textarea id="adminCancelReason" rows="2" placeholder="Reason required"></textarea></label><button class="btn dark" id="adminCancelOrder">Cancel order</button>` : ""}</div>`, () => modal.querySelector("#adminCancelOrder")?.addEventListener("click", () => perform(() => transitionOrder(store, o.id, "cancelled", modal.querySelector("#adminCancelReason").value))));
  }));
  app.querySelectorAll("[data-quality]").forEach(button => button.addEventListener("click", () => {
    const m = store.merchant(button.dataset.quality);
    open(`<form class="modal-body editor-form" id="qualityForm"><div class="modal-head"><div><div class="eyebrow">GoodKota Standard</div><h2>${e(m.name)}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div>
      <div class="standard-list">${STANDARD.map(check => `<label class="quality-check"><input type="checkbox" name="${check.id}" ${m.standard?.[check.id] ? "checked" : ""}><span><strong>${e(check.name)}</strong><small>${e(check.description)}</small></span></label>`).join("")}</div>
      <label>Review note<textarea name="reviewNote" rows="2" required placeholder="Evidence and next step">${e(m.reviewNote || "")}</textarea></label><button type="submit" class="btn primary">Save checks</button><div class="divider"></div>
      <label>Quality status<select name="qualityStatus">${["healthy","watch","intervention"].map(s => `<option value="${s}" ${m.quality?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Quality note<textarea name="qualityNote" rows="2" placeholder="Reason for this quality status">${e(m.quality?.note || "")}</textarea></label><button type="button" id="saveQualityStatus" class="btn ghost">Save quality status</button></form>`, () => {
        const form = modal.querySelector("form");
        form.addEventListener("submit", event => { event.preventDefault(); if (!form.reportValidity()) return; const data = new FormData(form); perform(() => reviewMerchant(store, m.id, Object.fromEntries(STANDARD.map(c => [c.id, data.has(c.id)])), data.get("reviewNote"))); });
        form.querySelector("#saveQualityStatus").addEventListener("click", () => perform(() => setQuality(store, m.id, formValue(form, "qualityStatus"), formValue(form, "qualityNote"))));
      });
  }));
  app.querySelectorAll("[data-case]").forEach(button => button.addEventListener("click", () => {
    const c = state.supportCases.find(item => item.id === button.dataset.case);
    open(`<form class="modal-body editor-form" id="caseForm"><div class="modal-head"><div><div class="eyebrow">Support · ${e(c.status)}</div><h2>${e(c.subject)}</h2></div><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p>${e(store.merchant(c.merchantId)?.name || "Merchant")} · ${date(c.updatedAt)}</p><p>${e(c.message)}</p>
      <label>Status<select name="status">${["open","in_progress","resolved"].map(s => `<option value="${s}" ${c.status === s ? "selected" : ""}>${s.replaceAll("_", " ")}</option>`).join("")}</select></label><label>Handover note<textarea name="note" rows="3" required>${e(c.note)}</textarea></label><button type="submit" class="btn primary">Save case</button></form>`, () => modal.querySelector("form").addEventListener("submit", event => { event.preventDefault(); if (event.currentTarget.reportValidity()) perform(() => updateCase(store, c.id, formValue(event.currentTarget, "status"), formValue(event.currentTarget, "note"))); }));
  }));
  app.querySelector("#reportForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    try { orderReport(state, data); Object.assign(state, {reportFrom: data.from, reportTo: data.to, reportMerchantId: data.merchantId}); store.save(); render(); }
    catch (error) { showToast(error.message); }
  });
  app.querySelector("#exportReport")?.addEventListener("click", () => {
    const result = orderReport(state, {from: state.reportFrom, to: state.reportTo, merchantId: state.reportMerchantId});
    const csv = ["Order ID,Date,Merchant,Customer,Status,Order value ZAR,Payment status", ...result.orders.map(o => [o.id, o.createdIso?.slice(0,10) || "", store.merchant(o.merchantId)?.name || "", o.customer, o.status, (o.total/100).toFixed(2), o.paymentStatus || "unpaid"].map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `goodkota-orders-${state.reportFrom}-${state.reportTo}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
