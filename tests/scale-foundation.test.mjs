import test from "node:test";
import assert from "node:assert/strict";

class LocalStorageMock {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
  key(index) { return [...this.map.keys()][index] ?? null; }
  get length() { return this.map.size; }
}

globalThis.localStorage = new LocalStorageMock();

const { AppStore } = await import("../js/core/store.js");
const { RepositoryHub } = await import("../js/repositories/repository-hub.js");
const { GoodKotaCommandService } = await import("../js/services/command-service.js");
const { LocalMarketplacePaymentAdapter } = await import("../js/services/payment-service.js");
const { FinancialLedgerService } = await import("../js/services/financial-ledger-service.js");

function fresh() {
  localStorage.clear();
  const store = new AppStore();
  const repos = new RepositoryHub(store);
  const paymentService = new LocalMarketplacePaymentAdapter(repos.platform.paymentGateway());
  const telemetry = { emit() {}, alert() {} };
  const commands = new GoodKotaCommandService({ store, paymentService, telemetry });
  return { store, repos, commands };
}

test("v6 persists top-level collections separately and uses integer cents", () => {
  const { store } = fresh();
  assert.ok(localStorage.getItem("goodkota_scale_v6:manifest"));
  assert.ok(localStorage.getItem("goodkota_scale_v6:orders"));
  assert.ok(localStorage.getItem("goodkota_scale_v6:merchants"));
  assert.equal(localStorage.getItem("goodkota_scale_v6"), null);

  for (const merchant of store.state.merchants) {
    assert.ok(Number.isInteger(merchant.deliveryFeeCents));
    assert.ok(Number.isInteger(merchant.minOrderCents));
    assert.equal("deliveryFee" in merchant, false);
    assert.equal("minOrder" in merchant, false);
  }
  for (const product of store.state.products) {
    assert.ok(Number.isInteger(product.priceCents));
    assert.equal("price" in product, false);
  }
  for (const order of store.state.orders) {
    assert.ok(Number.isInteger(order.amountCents));
    assert.ok(!String(order.id).startsWith("GK"));
    assert.match(order.orderNumber, /^GK/);
  }
});

test("legacy v5 money and sequential display IDs migrate safely", () => {
  localStorage.clear();
  localStorage.setItem("goodkota_foundation_v5", JSON.stringify({
    platform: { controls: {}, paymentGateway: { enabled: true }, retention: { driverLocationMinutes: 30 } },
    users: [{ id: "u1", role: "customer", notificationPreferences: {} }],
    merchants: [{ id: "m1", name: "Legacy", address: "Midrand", area: "Midrand", latitude: -26, longitude: 28.1, enabled: true, deliveryFee: 22.5, minOrder: 35, compliance: { status: "compliant" }, commercial: { status: "active" }, qualityWorkflow: { status: "healthy" } }],
    products: [{ id: "p1", merchantId: "m1", name: "Kota", price: 49.99, enabled: true }],
    orders: [{ id: "GK1001", customerId: "u1", merchantId: "m1", amount: 72.49, deliveryFee: 22.5, status: "completed", paymentStatus: "paid", items: [{ name: "Kota", qty: 1, price: 49.99 }] }]
  }));
  const store = new AppStore();
  assert.equal(store.state.merchants[0].deliveryFeeCents, 2250);
  assert.equal(store.state.merchants[0].minOrderCents, 3500);
  assert.equal(store.state.products[0].priceCents, 4999);
  assert.equal(store.state.orders[0].amountCents, 7249);
  assert.equal(store.state.orders[0].deliveryFeeCents, 2250);
  assert.equal(store.state.orders[0].orderNumber, "GK1001");
  assert.ok(!store.state.orders[0].id.startsWith("GK"));
});

test("repository lists are bounded and cursor-shaped", () => {
  const { store, repos } = fresh();
  const base = store.state.merchants[0];
  for (let i = 0; i < 350; i += 1) {
    store.state.merchants.push({ ...base, id: `bulk_${i}`, name: `Bulk ${i}`, createdAt: Date.now() + i, latitude: -25.999 + (i % 10) * 0.0001, longitude: 28.126 + (i % 10) * 0.0001 });
  }
  const first = repos.merchants.list({ limit: 1000 });
  assert.equal(first.items.length, 100);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  const second = repos.merchants.list({ limit: 100, cursor: first.nextCursor });
  assert.equal(second.items.length, 100);
  assert.notEqual(first.items[0].id, second.items[0].id);
  const nearby = repos.merchants.nearby({ lat: -25.9992, lng: 28.1263 }, { radiusKm: 5, limit: 30 });
  assert.ok(nearby.items.length <= 30);
  for (let i = 1; i < nearby.items.length; i += 1) assert.ok(nearby.items[i - 1].distanceKm <= nearby.items[i].distanceKm);
});

test("checkout is idempotent, uses scattered IDs, and creates delivery state once", async () => {
  const { store, commands } = fresh();
  const beforeOrders = store.state.orders.length;
  const beforePayments = store.state.paymentTransactions.length;
  const beforeTasks = store.state.deliveryTasks.length;
  const payload = {
    merchantId: "m1",
    customerId: "u_customer_1",
    customerDetails: { name: "Customer", phone: "0710000000", email: "customer@example.com" },
    mode: "Home Delivery",
    address: "1 Test Street, Midrand",
    notes: "",
    amountCents: 10000,
    deliveryFeeCents: 2400,
    fulfilment: { type: "delivery", provider: "goodkota_fleet", destination: { address: "1 Test Street, Midrand", latitude: -26.001, longitude: 28.127 } },
    items: [{ productId: "p2", name: "Loaded Kota", qty: 1, priceCents: 7600 }],
    idempotencyKey: "checkout-test-1"
  };
  const first = await commands.checkout(payload);
  const second = await commands.checkout(payload);
  assert.deepEqual(second, first);
  assert.equal(store.state.orders.length, beforeOrders + 1);
  assert.equal(store.state.paymentTransactions.length, beforePayments + 1);
  assert.equal(store.state.deliveryTasks.length, beforeTasks + 1);
  const order = store.order(first.orderId);
  assert.ok(order);
  assert.ok(!order.id.startsWith("GK"));
  assert.match(order.orderNumber, /^GK-\d{2}-[A-Z0-9]{6}$/);
  assert.equal(order.paymentStatus, "paid");
  assert.equal(store.state.idempotencyRecords.filter(item => item.key === payload.idempotencyKey).length, 1);
});

test("delivery assignment and completion protect task/driver concurrency", async () => {
  const { store, commands } = fresh();
  const checkout = await commands.checkout({
    merchantId: "m1", customerId: "u_customer_1",
    customerDetails: { name: "Customer", phone: "0710000000", email: "customer@example.com" },
    mode: "Home Delivery", address: "1 Test Street, Midrand", notes: "",
    amountCents: 10000, deliveryFeeCents: 2400,
    fulfilment: { type: "delivery", provider: "goodkota_fleet", destination: { address: "1 Test Street, Midrand", latitude: -26.001, longitude: 28.127 } },
    items: [{ productId: "p2", name: "Loaded Kota", qty: 1, priceCents: 7600 }], idempotencyKey: "checkout-delivery-2"
  });
  commands.merchantOrderTransition({ orderId: checkout.orderId, status: "accepted", merchantId: "m1" });
  commands.merchantOrderTransition({ orderId: checkout.orderId, status: "ready", merchantId: "m1" });
  const task = store.deliveryTaskForOrder(checkout.orderId);
  assert.equal(task.status, "ready_for_dispatch");
  commands.assignDriver({ taskId: task.id, driverId: "d2", actorId: "dispatch_test" });
  assert.throws(() => commands.assignDriver({ taskId: task.id, driverId: "d3", actorId: "dispatch_test_2" }), /no longer available for assignment|not currently available/);
  assert.equal(store.driver("d2").activeTaskId, task.id);
  const pin = task.verification.pin;
  for (const expected of ["driver_to_pickup", "at_pickup", "picked_up", "en_route", "arriving"]) {
    assert.equal(commands.advanceDriver({ driverId: "d2" }).status, expected);
  }
  assert.throws(() => commands.confirmDelivery({ driverId: "d2", pin: "0000" }), /incorrect/);
  const delivered = commands.confirmDelivery({ driverId: "d2", pin });
  assert.equal(delivered.status, "delivered");
  assert.equal(store.order(checkout.orderId).status, "completed");
  assert.equal(store.driver("d2").activeTaskId, null);
  assert.ok(store.state.proofsOfDelivery.some(item => item.taskId === task.id));
});

test("Owner/Admin authority is distinct and GoodKota cannot lose its last Owner", () => {
  const { store, commands } = fresh();
  const owner = store.platformActor("owner");
  const admin = store.platformActor("admin");
  assert.throws(() => commands.updatePlatformControl("paymentsEnabled", false, admin, "Test"), /permission/);
  commands.updatePlatformControl("paymentsEnabled", false, owner, "Incident test");
  assert.equal(store.state.platform.controls.paymentsEnabled, false);
  assert.throws(() => commands.updatePlatformStaff(owner.id, { role: "admin", active: true }, owner, "Test last owner rule"), /at least one active Owner/);
  const secondOwner = commands.addPlatformStaff({ name: "Second Owner", email: "owner2@example.com", role: "owner" }, owner, "Continuity test");
  assert.equal(secondOwner.role, "owner");
  commands.updatePlatformStaff(owner.id, { role: "admin", active: true }, secondOwner, "Owner handover test");
  assert.equal(store.state.platformStaff.filter(person => person.role === "owner" && person.active !== false).length, 1);
});

test("support activity is append-only and survives staff handover", () => {
  const { store, commands } = fresh();
  const admin = store.platformActor("admin");
  const created = commands.createSupportCase({ source: "merchant", sourceId: "m1", sourceName: "Kasi Bites", merchantId: "m1", subject: "Help", message: "Need assistance", priority: "high" });
  const before = store.state.supportCaseEvents.filter(event => event.caseId === created.id).length;
  commands.updateSupportCase(created.id, { status: "in_progress", assignedTo: admin.id, resolutionNote: "Investigating" }, admin);
  const after = store.state.supportCaseEvents.filter(event => event.caseId === created.id).length;
  assert.equal(after, before + 1);
  assert.equal(store.state.supportCases.find(item => item.id === created.id).status, "in_progress");
});

test("quality refresh updates only the affected merchant summary", () => {
  const { store, commands } = fresh();
  const m1Before = { ...store.merchant("m1").qualitySummary };
  const m2Before = { ...store.merchant("m2").qualitySummary };
  const rating = commands.submitRating({ orderId: "order_seed_2001", overall: 5, food: 5, service: 5, comment: "Excellent" });
  assert.equal(rating.merchantId, "m1");
  assert.equal(store.merchant("m1").qualitySummary.count, m1Before.count + 1);
  assert.deepEqual(store.merchant("m2").qualitySummary, m2Before);
  assert.throws(() => commands.submitRating({ orderId: "order_seed_2001", overall: 6, food: 5, service: 5 }), /completed, unrated|1 to 5/);
});

test("current driver location remains a single expiring hot snapshot", () => {
  const { store, commands } = fresh();
  const before = store.state.driverLocations.filter(item => item.driverId === "d2").length;
  commands.updateDriverLocation({ driverId: "d2", latitude: -25.9951, longitude: 28.1316, accuracyMeters: 9 });
  commands.updateDriverLocation({ driverId: "d2", latitude: -25.9952, longitude: 28.1317, accuracyMeters: 8 });
  assert.equal(before, 1);
  assert.equal(store.state.driverLocations.filter(item => item.driverId === "d2").length, 1);
  const location = store.state.driverLocations.find(item => item.driverId === "d2");
  assert.equal(location.latitude, -25.9952);
  assert.ok(location.expiresAt > Date.now());
  assert.ok(location.geohash);
});

test("local financial ledger prevents cumulative over-refunds", async () => {
  const { store, commands } = fresh();
  const checkout = await commands.checkout({
    merchantId: "m1", customerId: "u_customer_1",
    customerDetails: { name: "Customer", phone: "0710000000", email: "customer@example.com" },
    mode: "Takeaway", address: "", notes: "", amountCents: 7600, deliveryFeeCents: 0,
    fulfilment: { type: "pickup" }, items: [{ productId: "p2", name: "Loaded Kota", qty: 1, priceCents: 7600 }], idempotencyKey: "refund-base"
  });
  const ledger = new FinancialLedgerService(store);
  ledger.recordRefund({ paymentId: checkout.paymentId, orderId: checkout.orderId, merchantId: "m1", amountCents: 4000, reason: "Partial refund", actor: { id: "staff_admin_1" } });
  assert.throws(() => ledger.recordRefund({ paymentId: checkout.paymentId, orderId: checkout.orderId, merchantId: "m1", amountCents: 4000, reason: "Second refund", actor: { id: "staff_admin_1" } }), /exceed/);
});

test("large synthetic datasets still return bounded UI-facing pages", () => {
  const { store, repos } = fresh();
  const merchantTemplate = store.state.merchants[0];
  const orderTemplate = store.state.orders[0];
  for (let i = 0; i < 10000; i += 1) {
    store.state.merchants.push({ ...merchantTemplate, id: `scale_m_${i}`, name: `Scale Merchant ${i}`, createdAt: i + 1, latitude: -26 + (i % 100) * 0.00001, longitude: 28.1 + (i % 100) * 0.00001 });
  }
  for (let i = 0; i < 20000; i += 1) {
    store.state.orders.push({ ...orderTemplate, id: `scale_order_${i}`, orderNumber: `GK-SCALE-${i}`, merchantId: i % 2 ? "m1" : "m2", customerId: "u_customer_1", createdAt: i + 1 });
  }
  const started = Date.now();
  const merchants = repos.merchants.list({ limit: 50 });
  const customerOrders = repos.orders.listForCustomer("u_customer_1", { limit: 20 });
  const merchantOrders = repos.orders.listForMerchant("m1", { limit: 50 });
  const elapsed = Date.now() - started;
  assert.equal(merchants.items.length, 50);
  assert.equal(customerOrders.items.length, 20);
  assert.equal(merchantOrders.items.length, 50);
  assert.ok(elapsed < 5000, `Local adapter sanity query took ${elapsed}ms`);
});
