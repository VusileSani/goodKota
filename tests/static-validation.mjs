import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "index.html", "css/styles.css", "js/app.js", "js/core/store.js", "js/core/checkout.js", "js/core/operations.js", "js/core/feedback.js", "js/core/menu-choices.js", "js/views/payfast-setup.js", "js/views/admin-view.js", "js/data/seed.js", "server/server.mjs",
  "assets/goodkota-logo.png", "manifest.webmanifest", "service-worker.js", "README.md"
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const phrase of ["Pickup queue", "checkoutForm", "directionsUrl", "buildPickupOrder", "openMerchantApplication"]) {
  if (!app.includes(phrase)) throw new Error(`App missing ${phrase}`);
}
if (!fs.readFileSync(path.join(root, "js/core/checkout.js"), "utf8").includes('paymentStatus: "unpaid"')) throw new Error("Payment boundary missing from order contract");
const admin = fs.readFileSync(path.join(root, "js/views/admin-view.js"), "utf8");
for (const phrase of ["Applications", "Quality", "Support", "Payments", "Export CSV", "reviewApplication", "setMerchantStatus"]) {
  if (!admin.includes(phrase)) throw new Error(`Admin workflow missing ${phrase}`);
}
if (!readme.includes("PayFast")) throw new Error("Payment boundary missing");
if (/Keep the MVP simple|What we are not building yet|directions intent recorded/.test(app)) throw new Error("Development copy leaked into UI");
console.log("GoodKota MVP v13 static validation passed.");
