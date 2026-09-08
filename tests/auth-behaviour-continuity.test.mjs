import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const customer = fs.readFileSync(new URL("../js/views/customer-view.js", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../js/infrastructure/firebase-auth-service.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(auth, /browserLocalPersistence/);
assert.match(auth, /setPersistence\(auth, browserLocalPersistence\)/);
assert.match(auth, /continuing with the available Firebase fallback/);
assert.match(auth, /this\.initialized = false/);
assert.match(auth, /if \(this\.initialized\) listener\(this\.user\)/);
assert.match(app, /this\.authResolved = false/);
assert.match(app, /button\.textContent = "Checking…"/);
assert.match(app, /pendingCustomerAction/);
assert.match(app, /action\.startsWith\("account:"\)/);
assert.match(customer, /if \(!app\.authUser\).*Sign in to view your orders/s);
assert.match(customer, /privatePanels = new Set\(\["orders", "favourites", "addresses", "details", "payments", "preferences"\]\)/);
assert.match(customer, /Sign in or create an account to continue checkout\. Your cart is saved\./);
assert.match(customer, /data-account-logout/);
assert.match(customer, /app\.pendingCustomerAction = null/);
assert.match(index, />Preview as</);
assert.doesNotMatch(app, /navigate\([^)]*\)[\s\S]{0,300}authUser\s*=/);
console.log("authentication behaviour continuity checks passed");
