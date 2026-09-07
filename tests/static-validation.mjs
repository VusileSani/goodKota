import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

test("all JavaScript files pass Node syntax validation", () => {
  const files = [...walk(path.join(root, "js")), ...walk(path.join(root, "functions", "src"))].filter(file => file.endsWith(".js"));
  for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  assert.ok(files.length >= 20);
});

test("all relative JavaScript imports resolve", () => {
  const files = [...walk(path.join(root, "js")), ...walk(path.join(root, "functions", "src"))].filter(file => file.endsWith(".js"));
  const pattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const target = path.resolve(path.dirname(file), match[1]);
      assert.ok(fs.existsSync(target), `${path.relative(root, file)} imports missing ${match[1]}`);
    }
  }
});

test("views do not read global store collections directly", () => {
  const files = walk(path.join(root, "js", "views")).filter(file => file.endsWith(".js"));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(/app\.store\.state|store\.state/.test(source), false, `${path.basename(file)} bypasses repository boundary`);
  }
});

test("package/config/index files identify v6.1.1 and parse cleanly", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "6.1.1");
  assert.equal(pkg.name, "goodkota-v6-1-1-visible-ui-rollup");
  JSON.parse(read("firestore.indexes.json"));
  JSON.parse(read("firebase.json"));
  JSON.parse(read("config/production.json"));
});

test("HTML shell has unique IDs and every local asset reference exists", () => {
  const html = read("index.html");
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs detected");
  const refs = [...html.matchAll(/(?:src|href)=["'](\.\/[^"'#?]+)["']/g)].map(match => match[1]);
  for (const ref of refs) assert.ok(fs.existsSync(path.resolve(root, ref)), `Missing referenced asset ${ref}`);
  const website = read("website.html");
  for (const id of ["merchantApplicationForm", "driverApplicationForm", "waitlistForm", "publicPromotions", "socialLinks"]) assert.match(website, new RegExp(`id=["']${id}["']`), `Public website missing ${id}`);
  for (const ref of [...website.matchAll(/(?:src|href)=["'](\.\/[^"'#?]+)["']/g)].map(match => match[1])) assert.ok(fs.existsSync(path.resolve(root, ref)), `Public website missing referenced asset ${ref}`);
});

test("active UI source contains no prototype/demo labels", () => {
  const files = [path.join(root, "index.html"), ...walk(path.join(root, "js", "views"))];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(/\bprototype\b|\bdemo\b/i.test(source), false, `${path.relative(root, file)} contains development-facing wording`);
  }
});

test("scale foundation includes production enforcement artefacts", () => {
  for (const file of [
    "firestore.rules", "firestore.indexes.json", "firebase.json", "config/production.json",
    "docs/SCALE-FOUNDATION.md", "docs/SECURITY-AUTH.md", "docs/OBSERVABILITY-RUNBOOK.md",
    "docs/LOAD-TEST-PLAN.md", "docs/DATA-RETENTION.md", "docs/DISASTER-RECOVERY.md", "docs/ANALYTICS-EXPORT.md"
  ]) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
  assert.match(read("functions/src/payment-provider.js"), /fails closed|Refusing to create a paid order/i);
  assert.match(read("firestore.rules"), /allow write: if false/);
  assert.match(read("functions/src/index.js"), /runTransaction/);
  assert.match(read("functions/src/index.js"), /idempotencyRecords/);
  assert.match(read("functions/src/index.js"), /deliveryCredentials/);
  for (const command of ["submitMerchantApplication", "submitDriverApplication", "joinPublicWaitlist", "updateMerchantCatalogueItem", "adminManageDriver", "adminManagePromotion", "adminUpdateApplication", "ownerUpdateBrandSettings"]) assert.match(read("functions/src/index.js"), new RegExp(`export const ${command}`), `Missing production command ${command}`);
  assert.match(read("firestore.rules"), /merchantApplications/);
  assert.match(read("firestore.rules"), /promos/);
});


test("service worker and manifest cache only existing assets", () => {
  const sw = read("service-worker.js");
  const shellRefs = [...sw.matchAll(/["'](\.\/[^"']+)["']/g)].map(match => match[1]);
  for (const ref of shellRefs) assert.ok(fs.existsSync(path.resolve(root, ref)), `Service worker references missing ${ref}`);
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons || []) assert.ok(fs.existsSync(path.resolve(root, icon.src)), `Manifest references missing ${icon.src}`);
  const notification = read("js/services/notification-service.js");
  for (const match of notification.matchAll(/["'](\.\/assets\/[^"']+)["']/g)) {
    assert.ok(fs.existsSync(path.resolve(root, match[1])), `Notification service references missing ${match[1]}`);
  }
});
