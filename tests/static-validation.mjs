import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "index.html", "css/styles.css", "js/app.js", "js/core/store.js", "js/data/seed.js",
  "assets/goodkota-logo.png", "manifest.webmanifest", "service-worker.js", "README.md"
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const phrase of ["GoodKota Standard", "Pickup queue", "checkoutForm", "directionsUrl", "paymentStatus: \"unpaid\""]) {
  if (!app.includes(phrase)) throw new Error(`App missing ${phrase}`);
}
if (!readme.includes("PayFast")) throw new Error("Payment boundary missing");
if (/Keep the MVP simple|What we are not building yet|directions intent recorded/.test(app)) throw new Error("Development copy leaked into UI");
console.log("GoodKota MVP v8 static validation passed.");
