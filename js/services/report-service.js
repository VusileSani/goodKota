import { escapeHtml, formatDateTime, money } from "../core/utils.js";

function localDateValue(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function defaultReportRange(days = 7) {
  const end = Date.now();
  const start = end - Math.max(1, Number(days || 7) - 1) * 24 * 60 * 60 * 1000;
  return { from: localDateValue(start), to: localDateValue(end) };
}

export function reportPeriodBounds(from, to) {
  const fromValue = String(from || "").trim();
  const toValue = String(to || "").trim();
  const start = fromValue ? new Date(`${fromValue}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = toValue ? new Date(`${toValue}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(start) && Number.isFinite(end) && start > end) throw new Error("Report start date cannot be after the end date.");
  return { start, end, from: fromValue, to: toValue };
}

function withinPeriod(item, bounds, field = "createdAt") {
  const value = Number(item?.[field] || 0);
  return value >= bounds.start && value <= bounds.end;
}

function orderFoodCents(order) {
  return (order?.items || []).reduce((sum, item) => sum + Number(item.priceCents || 0) * Math.max(1, Number(item.qty || 1)), 0);
}

function fulfilmentLabel(order) {
  return order?.fulfilment?.type === "delivery" || order?.mode === "Home Delivery" ? "Delivery" : "Pickup";
}

function statusLabel(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
}

function periodLabel(bounds) {
  if (bounds.from && bounds.to) return `${bounds.from} to ${bounds.to}`;
  if (bounds.from) return `From ${bounds.from}`;
  if (bounds.to) return `Up to ${bounds.to}`;
  return "All available records";
}

function metric(label, value, detail = "") {
  return { label, value, detail };
}

function tableSection(title, headers, rows, description = "") {
  return { title, description, table: { headers, rows } };
}

export function buildMerchantSalesReport({ merchant, orders = [], from, to }) {
  const bounds = reportPeriodBounds(from, to);
  const filtered = orders.filter(order => order.merchantId === merchant.id && withinPeriod(order, bounds));
  const paid = filtered.filter(order => order.paymentStatus === "paid");
  const foodSalesCents = paid.reduce((sum, order) => sum + orderFoodCents(order), 0);
  const customerSpendCents = paid.reduce((sum, order) => sum + Number(order.amountCents || 0), 0);
  const deliveryFeesCents = paid.reduce((sum, order) => sum + Number(order.deliveryFeeCents || 0), 0);
  const productMap = new Map();
  paid.forEach(order => (order.items || []).forEach(item => {
    const key = item.productId || item.name;
    const current = productMap.get(key) || { name: item.name || "Item", qty: 0, salesCents: 0 };
    current.qty += Math.max(1, Number(item.qty || 1));
    current.salesCents += Number(item.priceCents || 0) * Math.max(1, Number(item.qty || 1));
    productMap.set(key, current);
  }));
  const products = [...productMap.values()].sort((a, b) => b.salesCents - a.salesCents);
  const orderRows = filtered.map(order => [
    new Date(order.createdAt).toLocaleDateString("en-ZA"),
    order.orderNumber || order.id,
    statusLabel(order.status),
    fulfilmentLabel(order),
    statusLabel(order.paymentStatus),
    money(orderFoodCents(order)),
    money(order.deliveryFeeCents || 0),
    money(order.amountCents || 0)
  ]);

  return {
    id: "merchant-sales",
    title: `${merchant.name} — Sales Report`,
    subtitle: `Paid-order sales and order activity for ${periodLabel(bounds)}.`,
    generatedAt: Date.now(),
    period: periodLabel(bounds),
    metrics: [
      metric("Orders", String(filtered.length)),
      metric("Paid orders", String(paid.length)),
      metric("Food sales", money(foodSalesCents), "Item value only"),
      metric("Customer spend", money(customerSpendCents), "Includes recorded delivery fees"),
      metric("Delivery fees", money(deliveryFeesCents)),
      metric("Avg. paid order", paid.length ? money(Math.round(foodSalesCents / paid.length)) : money(0), "Food value")
    ],
    note: filtered.length ? "Generated from the merchant's bounded Yagoya order records." : "No orders were recorded for this merchant in the selected period.",
    sections: [
      tableSection("Order activity", ["Date", "Order", "Status", "Fulfilment", "Payment", "Food", "Delivery fee", "Customer total"], orderRows),
      tableSection("Top products", ["Product", "Quantity", "Sales"], products.map(item => [item.name, String(item.qty), money(item.salesCents)]), "Ranked by recorded paid-order item value.")
    ],
    csv: { headers: ["Date", "Order", "Status", "Fulfilment", "Payment", "Food sales", "Delivery fee", "Customer total"], rows: orderRows }
  };
}

export function buildMerchantSettlementReport({ merchant, orders = [], payouts = [], refunds = [], from, to }) {
  const bounds = reportPeriodBounds(from, to);
  const paidOrders = orders.filter(order => order.merchantId === merchant.id && order.paymentStatus === "paid" && withinPeriod(order, bounds));
  const merchantRefunds = refunds.filter(item => item.merchantId === merchant.id && withinPeriod(item, bounds));
  const merchantPayouts = payouts.filter(item => item.merchantId === merchant.id && withinPeriod(item, bounds));
  const foodSalesCents = paidOrders.reduce((sum, order) => sum + orderFoodCents(order), 0);
  const deliveryFeesCents = paidOrders.reduce((sum, order) => sum + Number(order.deliveryFeeCents || 0), 0);
  const refundedCents = merchantRefunds.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const payoutCents = merchantPayouts.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const rows = [
    ...paidOrders.map(order => [new Date(order.createdAt).toLocaleDateString("en-ZA"), "Paid order", order.orderNumber || order.id, money(orderFoodCents(order)), "Recorded"]),
    ...merchantRefunds.map(item => [new Date(item.createdAt).toLocaleDateString("en-ZA"), "Refund", item.orderId || item.id, `-${money(item.amountCents || 0)}`, statusLabel(item.status)]),
    ...merchantPayouts.map(item => [new Date(item.createdAt).toLocaleDateString("en-ZA"), "Payout", item.providerReference || item.id, money(item.amountCents || 0), statusLabel(item.status)])
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return {
    id: "merchant-settlement",
    title: `${merchant.name} — Sales & Settlement Statement`,
    subtitle: `Recorded money events for ${periodLabel(bounds)}.`,
    generatedAt: Date.now(),
    period: periodLabel(bounds),
    metrics: [
      metric("Paid orders", String(paidOrders.length)),
      metric("Food sales", money(foodSalesCents), "Before refunds"),
      metric("Delivery fees", money(deliveryFeesCents)),
      metric("Recorded refunds", money(refundedCents)),
      metric("Recorded payouts", money(payoutCents)),
      metric("Settlement status", statusLabel(merchant.settlement?.status || "not configured"))
    ],
    note: merchantPayouts.length
      ? "Payout totals reflect only payout events recorded in Yagoya. This statement does not infer bank settlement that has not been recorded."
      : "No payout event is recorded for this period. Yagoya does not infer or invent a payout amount from sales data.",
    sections: [tableSection("Statement activity", ["Date", "Type", "Reference", "Amount", "Status"], rows)],
    csv: { headers: ["Date", "Type", "Reference", "Amount", "Status"], rows }
  };
}

export function buildPlatformOperationsQualityReport({ merchants = [], orders = [], openCases = [], qualityAlerts = [], settlementAttention = [], dispatchAttention = [], from, to, scopeName = "Yagoya network" }) {
  const bounds = reportPeriodBounds(from, to);
  const filteredOrders = orders.filter(order => withinPeriod(order, bounds));
  const paidOrders = filteredOrders.filter(order => order.paymentStatus === "paid");
  const paidSpendCents = paidOrders.reduce((sum, order) => sum + Number(order.amountCents || 0), 0);
  const activeStatuses = new Set(["pending", "accepted", "ready", "out_for_delivery"]);
  const merchantRows = merchants.map(merchant => {
    const merchantOrders = filteredOrders.filter(order => order.merchantId === merchant.id);
    const paid = merchantOrders.filter(order => order.paymentStatus === "paid");
    const spend = paid.reduce((sum, order) => sum + Number(order.amountCents || 0), 0);
    return [merchant.name, String(merchantOrders.length), money(spend), statusLabel(merchant.qualityWorkflow?.status || merchant.qualitySummary?.signal || "healthy"), statusLabel(merchant.settlement?.status || "not configured"), merchant.enabled === false ? "Disabled" : "Active"];
  }).sort((a, b) => Number(b[1]) - Number(a[1]));
  const exceptionRows = [
    ...qualityAlerts.map(merchant => ["Quality", merchant.name, merchant.qualityWorkflow?.note || merchant.qualitySummary?.reason || "Review required", "Open"]),
    ...settlementAttention.map(merchant => ["Settlement", merchant.name, `Settlement ${merchant.settlement?.status || "not configured"}`, "Open"]),
    ...dispatchAttention.map(task => ["Dispatch", task.orderId || task.id, "Delivery ready and awaiting assignment", statusLabel(task.status)]),
    ...openCases.map(item => ["Support", item.sourceName || item.merchantId || item.source || "Stakeholder", item.subject || item.message || "Support case", statusLabel(item.status)])
  ];

  return {
    id: "platform-operations-quality",
    title: `${scopeName} — Operations & Quality Report`,
    subtitle: `Decision-focused operating snapshot for ${periodLabel(bounds)}.`,
    generatedAt: Date.now(),
    period: periodLabel(bounds),
    metrics: [
      metric("Merchants", String(merchants.length)),
      metric("Orders", String(filteredOrders.length)),
      metric("Paid customer spend", money(paidSpendCents)),
      metric("Active orders", String(filteredOrders.filter(order => activeStatuses.has(order.status)).length)),
      metric("Quality exceptions", String(qualityAlerts.length)),
      metric("Open support", String(openCases.length))
    ],
    note: "The default report surfaces operating exceptions and bounded summary data. Detailed raw records remain in their operational workspaces.",
    sections: [
      tableSection("Exceptions requiring attention", ["Area", "Merchant / reference", "Issue", "Status"], exceptionRows, "Quality, settlement, dispatch and unresolved support exceptions."),
      tableSection("Merchant operating summary", ["Merchant", "Orders", "Paid spend", "Quality", "Settlement", "Status"], merchantRows)
    ],
    csv: { headers: ["Merchant", "Orders", "Paid spend", "Quality", "Settlement", "Status"], rows: merchantRows }
  };
}

function renderTable(table) {
  if (!table?.rows?.length) return '<div class="report-empty">No records for this section.</div>';
  return `<div class="report-table-wrap"><table class="report-table"><thead><tr>${table.headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function reportSheetMarkup(report) {
  if (!report) return "";
  return `<article class="report-sheet" data-report-id="${escapeHtml(report.id)}">
    <header class="report-header"><div><span class="report-brand">YAGOYA</span><h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(report.subtitle || "")}</p></div><div class="report-meta"><strong>${escapeHtml(report.period || "")}</strong><span>Generated ${escapeHtml(formatDateTime(report.generatedAt))}</span></div></header>
    <div class="report-metrics">${(report.metrics || []).map(item => `<div class="report-metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</div>`).join("")}</div>
    ${report.note ? `<div class="report-note">${escapeHtml(report.note)}</div>` : ""}
    ${(report.sections || []).map(section => `<section class="report-section"><div class="report-section-head"><h3>${escapeHtml(section.title)}</h3>${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}</div>${renderTable(section.table)}</section>`).join("")}
    <footer class="report-footer">Yagoya · Generated operational record</footer>
  </article>`;
}

const PRINT_CSS = `
  *{box-sizing:border-box} body{margin:0;background:#fff;color:#171717;font-family:Arial,Helvetica,sans-serif} .report-sheet{max-width:1100px;margin:0 auto;padding:26px}.report-header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #222;padding-bottom:16px}.report-brand{font-size:12px;font-weight:900;letter-spacing:.18em}.report-header h2{margin:5px 0 4px;font-size:24px}.report-header p,.report-meta span,.report-section-head p,.report-metric small{color:#5c5c5c}.report-meta{display:grid;gap:5px;text-align:right;font-size:12px}.report-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.report-metric{border:1px solid #cfcfcf;border-radius:8px;padding:10px;display:grid;gap:4px}.report-metric span{font-size:11px;color:#666}.report-metric strong{font-size:18px}.report-metric small{font-size:10px}.report-note{border:1px solid #d5d5d5;background:#f6f6f6;padding:10px 12px;border-radius:8px;font-size:11px;line-height:1.45}.report-section{margin-top:22px;break-inside:avoid-page}.report-section-head h3{margin:0 0 3px;font-size:16px}.report-section-head p{margin:0 0 9px;font-size:11px}.report-table{width:100%;border-collapse:collapse;font-size:10px}.report-table th,.report-table td{padding:7px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.report-table th{font-size:9px;text-transform:uppercase;letter-spacing:.04em;background:#f0f0f0}.report-empty{padding:12px;border:1px dashed #ccc;color:#666;font-size:11px}.report-footer{margin-top:24px;padding-top:10px;border-top:1px solid #ddd;color:#777;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.report-sheet{padding:0}.report-section{break-inside:auto}.report-table tr{break-inside:avoid}}@media(max-width:700px){.report-header{display:block}.report-meta{text-align:left;margin-top:10px}.report-metrics{grid-template-columns:repeat(2,1fr)}}`;

export function printReport(report) {
  if (!report) return;
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Your browser blocked the print window. Allow pop-ups for Yagoya and try again.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>${PRINT_CSS}</style></head><body>${reportSheetMarkup(report)}</body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 120);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadReportCsv(report) {
  if (!report?.csv) return;
  const lines = [report.csv.headers, ...(report.csv.rows || [])].map(row => row.map(csvEscape).join(","));
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.id}-${localDateValue(report.generatedAt)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
