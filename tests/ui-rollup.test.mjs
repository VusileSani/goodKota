import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("shell visibly exposes Yagoya brand navigation and actor context", () => {
  const html = read("index.html");
  assert.match(html, /class="header-brand-zone"/);
  assert.match(html, /id="brandLinks"/);
  assert.match(html, /Explore Yagoya/);
  assert.match(html, /id="actorContext"/);
  for (const role of ["customer","merchant","driver","delivery","admin","owner"]) assert.match(html, new RegExp(`value="${role}"`));
});

test("customer home has an orange Yagoya hero and branded navigation states", () => {
  const view = read("js/views/customer-view.js");
  const css = read("css/styles.css");
  assert.match(view, /customer-greeting-mark/);
  assert.match(view, /assets\/yagoya-logo\.png/);
  assert.match(css, /customer-home-screen \.customer-greeting/);
  assert.match(css, /linear-gradient\(120deg, rgba\(241,90,41/);
  assert.match(css, /customer-nav-item\.active/);
});

test("merchant workspace visibly exposes order detail, menu maintenance and storefront QR", () => {
  const view = read("js/views/merchant-view.js");
  assert.match(view, /class="actor-hero merchant-hero"/);
  assert.match(view, /Storefront QR/);
  assert.match(view, /id="merchantQrButton"/);
  assert.match(view, /id="addProductButton"/);
  assert.match(view, /data-edit-product/);
  assert.match(view, /data-open-order/);
});

test("Yagoya Admin and Owner are visibly separate workspaces", () => {
  const admin = read("js/views/admin-view.js");
  const owner = read("js/views/owner-view.js");
  const css = read("css/styles.css");
  assert.match(admin, /governance-hero admin-hero/);
  for (const label of ["Merchants","Applications","Drivers","Orders","Promotions","Support","Announcements","Activity"]) assert.match(admin, new RegExp(`>${label}`));
  assert.match(owner, /governance-hero owner-hero/);
  for (const marker of [
    'ownerTab("control", "Control"',
    'ownerTab("authority", "Authority"',
    'ownerTab("brand", "Brand"',
    'ownerTab("integrity", "Integrity"',
    'ownerTab("audit", "Audit"'
  ]) assert.ok(owner.includes(marker), `Owner view missing ${marker}`);
  assert.match(css, /governance-hero\.admin-hero/);
  assert.match(css, /governance-hero\.owner-hero/);
});

test("public Yagoya website carries brand, culture and stakeholder intake", () => {
  const website = read("website.html");
  for (const id of ["culture","promotions","merchants","drivers","waitlist"]) assert.match(website, new RegExp(`id="${id}"`));
  assert.match(website, /Kota Culture/);
  assert.match(website, /merchantApplicationForm/);
  assert.match(website, /driverApplicationForm/);
  assert.match(website, /socialLinks/);
});

test("UI keeps stable overlays and does not use scale transforms as navigation", () => {
  const css = read("css/styles.css");
  const app = read("js/app.js");
  assert.match(css, /body\.dialog-open/);
  assert.match(app, /dialogScrollY/);
  assert.equal(/transform\s*:\s*scale\(/i.test(css), false);
});

test("Admin overview materialized summary is passed explicitly and not read from an out-of-scope variable", () => {
  const admin = read("js/views/admin-view.js");
  assert.match(admin, /summary: snapshot\.summary/);
  assert.match(admin, /data\.summary\?\.merchantCount/);
  assert.equal(/overviewSection[\s\S]*snapshot\.summary\.merchantCount/.test(admin), false);
});


test("Yagoya header logo remains visible on narrow screens", () => {
  const html = read("index.html");
  const css = read("css/styles.css");
  assert.match(html, /class="brand-logo-shell"/);
  assert.match(html, /class="brand-logo" src="\.\/assets\/yagoya-logo\.png"/);
  assert.equal(/\.brand\s+span\s*\{\s*display\s*:\s*none/i.test(css), false);
  assert.match(css, /\.brand-wordmark\s*\{\s*display\s*:\s*none/);
  assert.match(css, /\.brand-logo-shell\s*\{\s*display\s*:\s*grid/);
});
