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
for (const phrase of ["30-day Repeat Finder Rate", "GoodKota Standard", "Pickup queue"]) {
  if (!app.includes(phrase)) throw new Error(`App missing ${phrase}`);
}
if (!readme.includes("Deliberately removed from the MVP")) throw new Error("MVP scope statement missing");
console.log("GoodKota MVP v7 static validation passed.");
