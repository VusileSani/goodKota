import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMerchantSalesReport,
  buildMerchantSettlementReport,
  buildPlatformOperationsQualityReport,
  reportPeriodBounds,
  reportSheetMarkup
} from "../js/services/report-service.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

const merchant = { id: "m1", name: "Test Kitchen", settlement: { status: "verified" }, qualityWorkflow: { status: "healthy" }, enabled: true };
const now = Date.now();
const from = new Date(now - 86400000).toISOString().slice(0, 10);
const to = new Date(now + 86400000).toISOString().slice(0, 10);
const orders = [{
  id: "o1", orderNumber: "YG1001", merchantId: "m1", createdAt: now, paymentStatus: "paid", status: "completed",
  amountCents: 12400, deliveryFeeCents: 2400, fulfilment: { type: "delivery" },
  items: [{ productId: "p1", name: "Loaded Kota", qty: 2, priceCents: 5000 }]
}];

const sales = buildMerchantSalesReport({ merchant, orders, from, to });
assert.equal(sales.metrics.find(item => item.label === "Food sales").value.includes("100"), true, "sales report uses item value");
assert.equal(sales.csv.rows.length, 1, "sales report exports order rows");
assert.match(reportSheetMarkup(sales), /Test Kitchen — Sales Report/, "sales report renders a printable sheet");

const settlement = buildMerchantSettlementReport({ merchant, orders, payouts: [], refunds: [], from, to });
assert.match(settlement.note, /does not infer or invent a payout amount/i, "settlement report never invents payout values");
assert.equal(settlement.metrics.find(item => item.label === "Recorded payouts").value.includes("0"), true, "zero recorded payouts remain explicit");

const platform = buildPlatformOperationsQualityReport({
  merchants: [merchant], orders, openCases: [{ merchantId: "m1", sourceName: "Test Kitchen", subject: "Settlement query", status: "open" }],
  qualityAlerts: [merchant], settlementAttention: [], dispatchAttention: [], from, to
});
assert.equal(platform.metrics.find(item => item.label === "Quality exceptions").value, "1", "platform report surfaces quality exceptions");
assert.match(reportSheetMarkup(platform), /Exceptions requiring attention/, "platform report is exception-focused");
assert.throws(() => reportPeriodBounds("2026-09-10", "2026-09-01"), /start date/i, "invalid date ranges are rejected");

const merchantView = read("js/views/merchant-view.js");
const adminView = read("js/views/admin-view.js");
const ownerView = read("js/views/owner-view.js");
const worker = read("service-worker.js");
assert.match(merchantView, /Reports & Statements/, "merchant reports workspace is visible");
assert.match(merchantView, /Print \/ Save PDF/, "merchant report print action is visible");
assert.match(adminView, /Operations & Quality/, "admin operations report is present");
assert.match(ownerView, /Business Reports/, "owner can generate business reports");
assert.match(worker, /report-service\.js/, "report service is part of the offline shell");

console.log("report generation tests passed");
