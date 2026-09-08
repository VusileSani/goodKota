import assert from "node:assert/strict";
import fs from "node:fs";

const customer = fs.readFileSync(new URL("../js/views/customer-view.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../js/infrastructure/firebase-auth-service.js", import.meta.url), "utf8");
for (const label of ["My Orders","My Favourites","My Addresses","My Details","Payments","Preferences","Help & Support","Account & Security","Log Out"]) assert.ok(customer.includes(label), `Missing ${label}`);
assert.ok(customer.includes("data-account-target"));
assert.ok(customer.includes("data-account-back"));
assert.ok(customer.includes("data-auth-mode"));
assert.ok(customer.includes("data-account-logout"));
assert.ok(app.includes("customerAccountPanel"));
assert.ok(auth.includes("signInWithEmailAndPassword"));
assert.ok(auth.includes("createUserWithEmailAndPassword"));
console.log("account/auth refinement checks passed");
