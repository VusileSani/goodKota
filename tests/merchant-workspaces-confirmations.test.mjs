import assert from "node:assert/strict";
import fs from "node:fs";

const merchant = fs.readFileSync(new URL("../js/views/merchant-view.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const store = fs.readFileSync(new URL("../js/core/store.js", import.meta.url), "utf8");
const commands = fs.readFileSync(new URL("../js/services/command-service.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
const customer = fs.readFileSync(new URL("../js/views/customer-view.js", import.meta.url), "utf8");

for (const label of ["Overview", "Orders", "Menu", "Quality", "Brand Materials", "Store Settings", "Support"]) {
  assert.ok(merchant.includes(label), `merchant navigation missing ${label}`);
}
assert.ok(merchant.includes('data-order-material="${item.code}"'));
assert.ok(merchant.includes("Order banner"));
assert.ok(merchant.includes("Company merchandise"));
assert.ok(merchant.includes("Place order"));
assert.ok(merchant.includes("Material order placed"));
assert.ok(merchant.includes("Save store settings"));
assert.ok(merchant.includes("Store settings saved"));
assert.ok(merchant.includes("Private merchant quality notice"));
assert.ok(store.includes('"brandMaterialOrders"'));
assert.ok(store.includes("addBrandMaterialOrder"));
assert.ok(commands.includes("orderBrandMaterial"));
assert.ok(commands.includes("merchantUpdateStore"));
assert.ok(app.includes("merchantSection = \"overview\""));
assert.ok(app.includes("app-toast"));
assert.ok(css.includes("merchant-section-tabs"));
assert.ok(css.includes("flex-wrap: wrap"));
assert.ok(customer.includes('pendingCustomerAction = "checkout"'));
assert.ok(customer.includes("Payment verified and order placed"));
console.log("merchant workspace/action confirmation checks passed");
