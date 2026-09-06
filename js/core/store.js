import { seed } from "../data/seed.js";
import { assessQuality, summariseRatings } from "../services/quality-service.js";
import { nextDriverStatus, statusEvent } from "../services/delivery-service.js";
import { encodeGeohash } from "../services/geohash-service.js";
import { LocalCollectionDatabase } from "../infrastructure/local-database.js";
import { toCents, uid } from "./utils.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const ARRAY_COLLECTIONS = [
  "users", "merchants", "products", "orders", "ratings",
  "paymentTransactions", "paymentEvents", "refunds", "merchantPayouts", "settlementEvents", "feeAllocations", "reconciliationRuns",
  "drivers", "driverVehicles", "driverLocations", "deliveryTasks", "deliveryAssignments", "deliveryEvents", "proofsOfDelivery",
  "platformStaff", "merchantMemberships", "supportCases", "supportCaseEvents", "announcements", "auditTrail",
  "orderEvents", "merchantComplianceEvents", "commercialStatusEvents", "idempotencyRecords", "jobs",
  "telemetryEvents", "operationalAlerts", "analyticsEvents", "promos"
];

function normaliseDeliveryStatus(status) {
  if (status === "driver_to_outlet") return "driver_to_pickup";
  if (status === "at_outlet") return "at_pickup";
  return status;
}

function migrateLegacyMerchantOutletModel(state) {
  if (!Array.isArray(state.outlets) || !state.outlets.length) {
    state.deliveryTasks?.forEach(task => { task.status = normaliseDeliveryStatus(task.status); delete task.outletId; });
    state.deliveryEvents?.forEach(event => {
      if (event.type === "outlet_ready") event.type = "merchant_ready";
      event.message = String(event.message || "").replace(/outlet/gi, "merchant");
    });
    return state;
  }

  const outletToMerchant = new Map();
  const migratedMerchants = [];
  state.merchants ||= [];

  state.merchants.forEach(merchant => {
    const related = state.outlets.filter(outlet => outlet.merchantId === merchant.id);
    const primary = related.find(outlet => outlet.id === merchant.primaryOutletId) || related[0] || null;
    const merge = outlet => ({
      ...merchant,
      id: outlet && outlet.id !== primary?.id ? `${merchant.id}_${outlet.id}` : merchant.id,
      name: outlet?.name || merchant.name,
      address: outlet?.address || merchant.address || "",
      area: outlet?.area || merchant.area || "",
      latitude: outlet?.latitude ?? merchant.latitude ?? null,
      longitude: outlet?.longitude ?? merchant.longitude ?? null,
      enabled: outlet?.enabled ?? merchant.enabled ?? true,
      prepMinutes: outlet?.prepMinutes ?? merchant.prepMinutes ?? 20,
      deliveryFee: outlet?.deliveryFee ?? merchant.deliveryFee ?? 20,
      minOrder: outlet?.minOrder ?? merchant.minOrder ?? 30,
      delivery: { ...(merchant.delivery || {}), ...(outlet?.delivery || {}) }
    });
    const primaryMerchant = merge(primary);
    delete primaryMerchant.primaryOutletId;
    migratedMerchants.push(primaryMerchant);
    if (primary) outletToMerchant.set(primary.id, primaryMerchant.id);
    related.filter(outlet => outlet.id !== primary?.id).forEach(outlet => {
      const copy = merge(outlet);
      outletToMerchant.set(outlet.id, copy.id);
      migratedMerchants.push(copy);
    });
  });

  state.outlets.forEach(outlet => {
    if (outletToMerchant.has(outlet.id)) return;
    const id = outlet.merchantId || `merchant_${outlet.id}`;
    outletToMerchant.set(outlet.id, id);
    migratedMerchants.push({
      id, name: outlet.name, legalName: outlet.name, contact: {}, address: outlet.address || "", area: outlet.area || "",
      latitude: outlet.latitude ?? null, longitude: outlet.longitude ?? null, enabled: outlet.enabled !== false,
      prepMinutes: outlet.prepMinutes ?? 20, deliveryFee: outlet.deliveryFee ?? 20, minOrder: outlet.minOrder ?? 30,
      delivery: outlet.delivery || { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" },
      compliance: { status: "pending_review", note: "Migrated merchant record" }, qualityWorkflow: { status: "healthy", note: "" }
    });
  });

  const products = [];
  (state.products || []).forEach(product => {
    const outletIds = Array.isArray(product.outletIds) ? product.outletIds : [];
    if (!outletIds.length) return products.push({ ...product });
    [...new Set(outletIds.map(id => outletToMerchant.get(id)).filter(Boolean))].forEach((merchantId, index) => {
      const copy = { ...product, merchantId, id: index ? `${product.id}_${merchantId}` : product.id };
      delete copy.outletIds;
      products.push(copy);
    });
  });

  for (const collection of ["orders", "ratings", "qualityCases", "deliveryTasks"]) {
    (state[collection] || []).forEach(item => {
      if (item.outletId && outletToMerchant.get(item.outletId)) item.merchantId = outletToMerchant.get(item.outletId);
      delete item.outletId;
    });
  }
  state.merchants = migratedMerchants;
  state.products = products;
  delete state.outlets;
  return state;
}

function centsField(object, centsKey, legacyKey, fallbackRands = 0) {
  if (object[centsKey] === undefined) object[centsKey] = toCents(object[legacyKey] ?? fallbackRands);
  delete object[legacyKey];
}

function migrateMoney(state) {
  (state.merchants || []).forEach(merchant => {
    centsField(merchant, "deliveryFeeCents", "deliveryFee", 20);
    centsField(merchant, "minOrderCents", "minOrder", 30);
  });
  (state.products || []).forEach(product => centsField(product, "priceCents", "price", 0));
  (state.orders || []).forEach(order => {
    centsField(order, "amountCents", "amount", 0);
    centsField(order, "deliveryFeeCents", "deliveryFee", 0);
    (order.items || []).forEach(item => centsField(item, "priceCents", "price", 0));
  });
  const payments = state.paymentTransactions || state.payments || [];
  payments.forEach(payment => {
    centsField(payment, "amountCents", "amount", 0);
    const breakdown = payment.amountBreakdown || {};
    if (breakdown.foodAmountCents === undefined) breakdown.foodAmountCents = toCents(breakdown.foodAmount || 0);
    if (breakdown.deliveryAmountCents === undefined) breakdown.deliveryAmountCents = toCents(breakdown.deliveryAmount || 0);
    delete breakdown.foodAmount;
    delete breakdown.deliveryAmount;
    payment.amountBreakdown = breakdown;
    if (payment.settlementPlan?.food) centsField(payment.settlementPlan.food, "amountCents", "amount", 0);
    if (payment.settlementPlan?.delivery) centsField(payment.settlementPlan.delivery, "amountCents", "amount", 0);
  });
  state.paymentTransactions = payments;
  delete state.payments;
  (state.deliveryTasks || []).forEach(task => centsField(task, "deliveryFeeCents", "deliveryFee", 0));
  (state.promos || []).forEach(promo => centsField(promo, "minCents", "min", 0));
}

function migrateOrderIds(state) {
  const map = new Map();
  (state.orders || []).forEach(order => {
    if (!order.orderNumber) order.orderNumber = String(order.id || "").startsWith("GK") ? String(order.id) : `GK-${String(order.id || "ORDER").slice(-8).toUpperCase()}`;
    if (String(order.id || "").startsWith("GK")) {
      const oldId = order.id;
      order.id = uid("order");
      map.set(oldId, order.id);
    }
    order.version = Number(order.version || 1);
  });
  if (!map.size) return;
  (state.deliveryTasks || []).forEach(task => { if (map.has(task.orderId)) task.orderId = map.get(task.orderId); });
  (state.ratings || []).forEach(rating => { if (map.has(rating.orderId)) rating.orderId = map.get(rating.orderId); });
  (state.paymentTransactions || []).forEach(payment => { if (map.has(payment.orderId)) payment.orderId = map.get(payment.orderId); });
  (state.proofsOfDelivery || []).forEach(proof => { if (map.has(proof.orderId)) proof.orderId = map.get(proof.orderId); });
}

export class AppStore {
  constructor() {
    this.db = new LocalCollectionDatabase(seed);
    this.state = this.db.load();
    migrateLegacyMerchantOutletModel(this.state);
    this.ensureCollections();
    migrateMoney(this.state);
    migrateOrderIds(this.state);
    this.ensureMerchantAdministration();
    this.ensurePlatformGovernance();
    this.ensureScaleFoundation();
    this.ensureQualitySummaries();
    this.ensureMaterializedSummaries();
    this.save();
  }

  ensureCollections() {
    ARRAY_COLLECTIONS.forEach(key => { if (!Array.isArray(this.state[key])) this.state[key] = []; });
    if (!this.state.platform) this.state.platform = clone(seed.platform || { name: "GoodKota" });
    if (!this.state.materialized) this.state.materialized = {};
  }

  ensureMerchantAdministration() {
    this.state.users?.forEach(user => {
      if (user.role === "customer" && user.notificationPreferences) {
        if (user.notificationPreferences.nearbyQualityMerchants === undefined) user.notificationPreferences.nearbyQualityMerchants = Boolean(user.notificationPreferences.nearbyQualityOutlets);
        delete user.notificationPreferences.nearbyQualityOutlets;
      }
    });

    this.state.merchants.forEach(merchant => {
      merchant.createdAt ||= Date.now();
      merchant.contact ||= {};
      merchant.compliance ||= { status: merchant.settlement?.status === "verified" ? "compliant" : "pending_review", note: "" };
      merchant.delivery ||= { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" };
      merchant.deliveryCapability ||= { ownDrivers: false, acceptsGoodKotaFleet: true, thirdPartyAllowed: true };
      merchant.qualityWorkflow ||= { status: "healthy", note: "" };
      merchant.commercial ||= { plan: "Standard", status: "active", note: "" };
      merchant.prepMinutes ??= 20;
      merchant.deliveryFeeCents ??= 2000;
      merchant.minOrderCents ??= 3000;
      if (Number.isFinite(Number(merchant.latitude)) && Number.isFinite(Number(merchant.longitude))) merchant.geohash = encodeGeohash(merchant.latitude, merchant.longitude);
      merchant.version = Number(merchant.version || 1);
    });
    this.state.products.forEach(product => { product.createdAt ||= Date.now(); product.version = Number(product.version || 1); });
  }

  ensurePlatformGovernance() {
    this.state.platform.controls = {
      maintenanceMode: false, orderingEnabled: true, paymentsEnabled: true, deliveryEnabled: true, merchantOnboardingEnabled: true,
      ...(this.state.platform.controls || {})
    };
    this.state.platform.region = this.state.platform.region || "africa-south1";
    this.state.platform.featureFlags ||= {
      customerSearchV2: { enabled: true, rolloutPercent: 100 },
      deliveryDispatchV2: { enabled: true, rolloutPercent: 100 }
    };
    this.state.platform.retention ||= { driverLocationMinutes: 30, telemetryDays: 30, supportDays: 730, auditDays: 2555 };

    if (!this.state.platformStaff.some(person => person.role === "owner" && person.active !== false)) {
      this.state.platformStaff.unshift({ id: uid("staff"), authUid: null, name: "GoodKota Owner", email: "owner@goodkota.co.za", role: "owner", active: true, createdAt: Date.now() });
    }
    if (!this.state.platformStaff.some(person => person.role === "admin" && person.active !== false)) {
      this.state.platformStaff.push({ id: uid("staff"), authUid: null, name: "Platform Operations", email: "admin@goodkota.co.za", role: "admin", active: true, createdAt: Date.now() });
    }
    this.state.platformStaff.forEach(person => { if (person.authUid === undefined) person.authUid = null; person.version = Number(person.version || 1); });
    this.state.announcements.forEach(item => { if (item.active === undefined) item.active = true; });
  }

  ensureScaleFoundation() {
    this.state.drivers.forEach(driver => { driver.createdAt ||= Date.now(); driver.version = Number(driver.version || 1); });
    const ttlMs = Number(this.state.platform.retention.driverLocationMinutes || 30) * 60_000;
    this.state.driverLocations.forEach(location => {
      location.geohash = encodeGeohash(location.latitude, location.longitude);
      location.expiresAt = location.expiresAt || Number(location.recordedAt || Date.now()) + ttlMs;
    });
    // Keep one current location snapshot per driver. Historical movement belongs in
    // delivery events / analytics, not in the hot dispatch document.
    const latestLocations = new Map();
    [...this.state.driverLocations]
      .sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0))
      .forEach(location => { if (!latestLocations.has(location.driverId)) latestLocations.set(location.driverId, location); });
    this.state.driverLocations = [...latestLocations.values()];
    this.state.deliveryTasks.forEach(task => { task.version = Number(task.version || 1); });
    this.state.supportCases.forEach(item => { item.version = Number(item.version || 1); });
    this.state.idempotencyRecords = this.state.idempotencyRecords.filter(record => !record.expiresAt || record.expiresAt > Date.now());

    if (!this.state.merchantMemberships.length) {
      this.state.merchants.forEach(merchant => this.state.merchantMemberships.push({
        id: uid("membership"), uid: null, merchantId: merchant.id, role: "merchant_manager", active: true, createdAt: Date.now()
      }));
    }

    if (!this.state.orderEvents.length) {
      this.state.orders.forEach(order => this.state.orderEvents.push({ id: uid("order_event"), orderId: order.id, type: "order_migrated", status: order.status, actorType: "system", actorId: "goodkota", createdAt: order.createdAt || Date.now() }));
    }
    if (!this.state.supportCaseEvents.length) {
      this.state.supportCases.forEach(item => this.state.supportCaseEvents.push({ id: uid("support_event"), caseId: item.id, type: "case_created", actorType: item.source || "system", actorId: item.sourceId || "goodkota", note: item.message || "", createdAt: item.createdAt || Date.now() }));
    }
  }

  save() { this.db.save(this.state); }

  transaction(fn) {
    const snapshot = clone(this.state);
    try {
      const result = fn();
      this.save();
      return result;
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  reset() {
    this.db.clear();
    this.state = clone(seed);
    this.ensureCollections();
    migrateMoney(this.state);
    migrateOrderIds(this.state);
    this.ensureMerchantAdministration();
    this.ensurePlatformGovernance();
    this.ensureScaleFoundation();
    this.refreshAllQualitySummaries(false);
    this.buildMaterializedSummaries(false);
    this.save();
  }

  get customer() { return this.state.users.find(user => user.role === "customer") || null; }
  merchant(id) { return this.state.merchants.find(item => item.id === id) || null; }
  product(id) { return this.state.products.find(item => item.id === id) || null; }
  driver(id) { return this.state.drivers.find(item => item.id === id) || null; }
  vehicle(id) { return this.state.driverVehicles.find(item => item.id === id) || null; }
  deliveryTask(id) { return this.state.deliveryTasks.find(item => item.id === id) || null; }
  order(id) { return this.state.orders.find(item => item.id === id) || null; }
  deliveryTaskForOrder(orderId) { return this.state.deliveryTasks.find(task => task.orderId === orderId) || null; }
  productsForMerchant(merchantId) { return this.state.products.filter(product => product.enabled && product.merchantId === merchantId); }
  ratingsForMerchant(merchantId) { return this.state.ratings.filter(rating => rating.merchantId === merchantId); }

  refreshQualitySummary(merchantId, persist = true, syncMaterialized = true) {
    const merchant = this.merchant(merchantId);
    if (!merchant) return null;
    const before = clone(merchant);
    const summary = summariseRatings(this.ratingsForMerchant(merchantId));
    merchant.qualitySummary = { ...summary, ...assessQuality(summary), updatedAt: Date.now() };
    if (merchant.qualitySummary.signal === "alert" && merchant.qualityWorkflow.status === "healthy") {
      merchant.qualityWorkflow = { status: "watch", note: "Automatically flagged by verified customer ratings" };
    }
    if (syncMaterialized) this.syncMerchantMaterialized(merchant, before);
    if (persist) this.save();
    return merchant.qualitySummary;
  }

  ensureQualitySummaries() {
    this.state.merchants.forEach(merchant => {
      if (!merchant.qualitySummary || merchant.qualitySummary.updatedAt === undefined) this.refreshQualitySummary(merchant.id, false, false);
    });
  }

  refreshAllQualitySummaries(persist = true) {
    this.state.merchants.forEach(merchant => this.refreshQualitySummary(merchant.id, false, false));
    if (persist) this.save();
  }

  merchantSignals(merchant) {
    return {
      active: Boolean(merchant?.enabled && merchant?.commercial?.status !== "suspended" && merchant?.compliance?.status !== "suspended"),
      settlement: Boolean(merchant && merchant.settlement?.status !== "verified"),
      quality: Boolean(merchant && (["watch", "intervention", "probation", "suspended"].includes(merchant.qualityWorkflow?.status) || ["alert", "watch"].includes(merchant.qualitySummary?.signal))),
      commercial: Boolean(merchant && ["review", "overdue", "suspended"].includes(merchant.commercial?.status))
    };
  }

  taskSignals(task) {
    return {
      active: Boolean(task && !["delivered", "cancelled"].includes(task.status)),
      dispatch: Boolean(task && task.status === "ready_for_dispatch" && !task.assignedDriverId)
    };
  }

  ensureMaterializedSummaries() {
    if (Number(this.state.materialized?.platformSummary?.version || 0) >= 2 && this.state.materialized?.attention) return;
    this.buildMaterializedSummaries(false);
  }

  buildMaterializedSummaries(persist = true) {
    const activeDeliveries = this.state.deliveryTasks.filter(task => this.taskSignals(task).active).length;
    const qualityAttention = this.state.merchants.filter(m => this.merchantSignals(m).quality);
    const settlementAttention = this.state.merchants.filter(m => this.merchantSignals(m).settlement);
    const commercialAttention = this.state.merchants.filter(m => this.merchantSignals(m).commercial);
    const dispatchAttention = this.state.deliveryTasks.filter(task => this.taskSignals(task).dispatch);
    const openCases = this.state.supportCases.filter(item => item.status !== "resolved");
    this.state.materialized.platformSummary = {
      version: 2,
      merchantCount: this.state.merchants.length,
      activeMerchants: this.state.merchants.filter(m => this.merchantSignals(m).active).length,
      paidOrders: this.state.orders.filter(o => o.paymentStatus === "paid").length,
      activeDeliveries,
      openSupportCases: openCases.length,
      settlementAttention: settlementAttention.length,
      qualityAttention: qualityAttention.length,
      commercialAttention: commercialAttention.length,
      updatedAt: Date.now()
    };
    this.state.materialized.attention = {
      qualityMerchantIds: qualityAttention.sort((a,b) => Number(b.qualitySummary?.updatedAt || b.createdAt || 0) - Number(a.qualitySummary?.updatedAt || a.createdAt || 0)).slice(0, 100).map(item => item.id),
      settlementMerchantIds: settlementAttention.sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 100).map(item => item.id),
      commercialMerchantIds: commercialAttention.sort((a,b) => Number(b.commercial?.updatedAt || b.createdAt || 0) - Number(a.commercial?.updatedAt || a.createdAt || 0)).slice(0, 100).map(item => item.id),
      dispatchTaskIds: dispatchAttention.sort((a,b) => Number(b.readyAt || b.createdAt || 0) - Number(a.readyAt || a.createdAt || 0)).slice(0, 100).map(item => item.id),
      openSupportCaseIds: openCases.sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 100).map(item => item.id)
    };
    if (persist) this.save();
  }

  touchSummary() {
    this.state.materialized.platformSummary ||= { version: 2 };
    this.state.materialized.platformSummary.version = 2;
    this.state.materialized.platformSummary.updatedAt = Date.now();
    this.state.materialized.attention ||= { qualityMerchantIds: [], settlementMerchantIds: [], commercialMerchantIds: [], dispatchTaskIds: [], openSupportCaseIds: [] };
  }

  setAttention(group, id, active) {
    this.touchSummary();
    const ids = this.state.materialized.attention[group] ||= [];
    const next = ids.filter(item => item !== id);
    if (active) next.unshift(id);
    this.state.materialized.attention[group] = next.slice(0, 100);
  }

  syncMerchantMaterialized(merchant, before = null, isNew = false) {
    this.touchSummary();
    const summary = this.state.materialized.platformSummary;
    const afterSignals = this.merchantSignals(merchant);
    const beforeSignals = before ? this.merchantSignals(before) : { active: false, settlement: false, quality: false, commercial: false };
    if (isNew) summary.merchantCount = Number(summary.merchantCount || 0) + 1;
    summary.activeMerchants = Math.max(0, Number(summary.activeMerchants || 0) + Number(afterSignals.active) - Number(beforeSignals.active));
    summary.settlementAttention = Math.max(0, Number(summary.settlementAttention || 0) + Number(afterSignals.settlement) - Number(beforeSignals.settlement));
    summary.qualityAttention = Math.max(0, Number(summary.qualityAttention || 0) + Number(afterSignals.quality) - Number(beforeSignals.quality));
    summary.commercialAttention = Math.max(0, Number(summary.commercialAttention || 0) + Number(afterSignals.commercial) - Number(beforeSignals.commercial));
    this.setAttention("settlementMerchantIds", merchant.id, afterSignals.settlement);
    this.setAttention("qualityMerchantIds", merchant.id, afterSignals.quality);
    this.setAttention("commercialMerchantIds", merchant.id, afterSignals.commercial);
  }

  syncTaskMaterialized(task, before = null, isNew = false) {
    this.touchSummary();
    const summary = this.state.materialized.platformSummary;
    const afterSignals = this.taskSignals(task);
    const beforeSignals = before ? this.taskSignals(before) : { active: false, dispatch: false };
    if (isNew || before) summary.activeDeliveries = Math.max(0, Number(summary.activeDeliveries || 0) + Number(afterSignals.active) - Number(beforeSignals.active));
    this.setAttention("dispatchTaskIds", task.id, afterSignals.dispatch);
  }

  syncSupportMaterialized(item, before = null, isNew = false) {
    this.touchSummary();
    const summary = this.state.materialized.platformSummary;
    const afterOpen = item?.status !== "resolved";
    const beforeOpen = before ? before.status !== "resolved" : false;
    if (isNew || before) summary.openSupportCases = Math.max(0, Number(summary.openSupportCases || 0) + Number(afterOpen) - Number(beforeOpen));
    this.setAttention("openSupportCaseIds", item.id, afterOpen);
  }

  incrementPaidOrders(delta = 1) {
    this.touchSummary();
    this.state.materialized.platformSummary.paidOrders = Math.max(0, Number(this.state.materialized.platformSummary.paidOrders || 0) + Number(delta || 0));
  }

  generateOrderNumber() {
    return `GK-${new Date().getFullYear().toString().slice(-2)}-${uid("").replace(/^_/, "").replace(/-/g, "").slice(-6).toUpperCase()}`;
  }

  createPaidOrder({ id = uid("order"), orderNumber = this.generateOrderNumber(), customerId, merchantId, customer, phone, email, mode, address = "", notes = "", amountCents, deliveryFeeCents = 0, fulfilment, paymentId, items, idempotencyKey }) {
    if (this.order(id)) throw new Error("Order already exists.");
    const order = { id, orderNumber, customerId, merchantId, customer, phone, email, mode, address, notes, amountCents, deliveryFeeCents, fulfilment, status: "pending", paymentStatus: "paid", paymentId, createdAt: Date.now(), items, rated: false, idempotencyKey, version: 1 };
    this.state.orders.unshift(order);
    this.appendOrderEvent(order.id, "order_created", "pending", "system", "goodkota", { paymentId });
    if (fulfilment?.type === "delivery") this.createDeliveryTaskForOrder(order);
    this.incrementPaidOrders(1);
    return order;
  }

  createDeliveryTaskForOrder(order) {
    if (this.deliveryTaskForOrder(order.id)) return this.deliveryTaskForOrder(order.id);
    const merchant = this.merchant(order.merchantId);
    const destination = order.fulfilment?.destination;
    if (!merchant || !destination) return null;
    const providerType = order.fulfilment.provider || merchant.delivery?.providerPreference || "goodkota_fleet";
    const task = {
      id: uid("delivery"), orderId: order.id, merchantId: order.merchantId, providerType, status: "awaiting_prep",
      assignedDriverId: null, assignmentId: null, deliveryFeeCents: order.deliveryFeeCents || 0,
      pickup: { address: `${merchant.name}, ${merchant.address}`, latitude: merchant.latitude, longitude: merchant.longitude, geohash: merchant.geohash },
      dropoff: { address: destination.address, latitude: destination.latitude, longitude: destination.longitude, geohash: encodeGeohash(destination.latitude, destination.longitude) },
      verification: { method: "pin", pin: String(Math.floor(1000 + Math.random() * 9000)) },
      createdAt: Date.now(), readyAt: null, assignedAt: null, pickedUpAt: null, estimatedArrivalAt: null, deliveredAt: null, version: 1
    };
    this.state.deliveryTasks.unshift(task);
    this.syncTaskMaterialized(task, null, true);
    this.recordDeliveryEvent(task.id, "delivery_created", "Delivery task created", "system", "goodkota");
    return task;
  }

  appendPaymentTransaction(payment) { this.state.paymentTransactions.unshift({ ...payment, version: Number(payment.version || 1) }); return payment; }
  appendPaymentEvent(event) { this.state.paymentEvents.unshift({ id: uid("payment_event"), createdAt: Date.now(), ...event }); }
  appendOrderEvent(orderId, type, status, actorType = "system", actorId = "goodkota", metadata = {}) { this.state.orderEvents.unshift({ id: uid("order_event"), orderId, type, status, actorType, actorId, metadata, createdAt: Date.now() }); }
  appendSupportEvent(caseId, type, actor, note = "", metadata = {}) { this.state.supportCaseEvents.push({ id: uid("support_event"), caseId, type, actorType: actor?.role || "system", actorId: actor?.id || "system", actorName: actor?.name || "System", note: String(note || ""), metadata, createdAt: Date.now() }); }
  appendComplianceEvent(merchantId, before, after, actor, reason = "") { this.state.merchantComplianceEvents.unshift({ id: uid("compliance_event"), merchantId, before, after, actorId: actor?.id || "system", actorRole: actor?.role || "system", reason, createdAt: Date.now() }); }
  appendCommercialEvent(merchantId, before, after, actor, reason = "") { this.state.commercialStatusEvents.unshift({ id: uid("commercial_event"), merchantId, before, after, actorId: actor?.id || "system", actorRole: actor?.role || "system", reason, createdAt: Date.now() }); }
  appendTelemetry(record) { this.state.telemetryEvents.unshift(record); if (this.state.telemetryEvents.length > 2000) this.state.telemetryEvents.length = 2000; this.save(); }
  appendOperationalAlert(alert) { this.state.operationalAlerts.unshift(alert); this.save(); return alert; }
  appendAnalyticsEvent(event) { this.state.analyticsEvents.unshift({ id: uid("analytics"), createdAt: Date.now(), ...event }); }

  recordDeliveryEvent(taskId, type, message, actorType = "system", actorId = "goodkota", metadata = {}) {
    this.state.deliveryEvents.push({ id: uid("delivery_event"), taskId, type, message, actorType, actorId, metadata, createdAt: Date.now() });
  }

  updateOrderStatus(orderId, status, actor = { role: "merchant", id: "merchant" }) {
    const order = this.order(orderId);
    if (!order) throw new Error("Order not found.");
    const allowed = {
      pending: ["accepted", "rejected"], accepted: ["ready", "cancelled"], ready: ["completed"], out_for_delivery: ["completed"]
    };
    if (!(allowed[order.status] || []).includes(status)) throw new Error(`Order cannot move from ${order.status} to ${status}.`);
    order.status = status;
    order.version += 1;
    this.appendOrderEvent(order.id, "order_status_changed", status, actor.role, actor.id);
    const task = this.deliveryTaskForOrder(orderId);
    const taskBefore = task ? clone(task) : null;
    if (task && status === "ready") {
      task.status = "ready_for_dispatch";
      task.readyAt = Date.now();
      task.version += 1;
      this.recordDeliveryEvent(task.id, "merchant_ready", "Merchant marked order ready", "merchant", order.merchantId);
      this.syncTaskMaterialized(task, taskBefore);
    }
    return order;
  }

  assignDriver(taskId, driverId, assignedBy = "dispatch") {
    const task = this.deliveryTask(taskId);
    const driver = this.driver(driverId);
    if (!task || !driver) throw new Error("Delivery task or driver not found.");
    if (driver.availability !== "available" || driver.activeTaskId) throw new Error("Driver is not currently available.");
    if (task.assignedDriverId || task.status !== "ready_for_dispatch") throw new Error("This delivery is no longer available for assignment.");
    const taskBefore = clone(task);
    const assignment = { id: uid("assignment"), taskId, driverId, status: "active", assignedBy, assignedAt: Date.now(), version: 1 };
    this.state.deliveryAssignments.push(assignment);
    task.assignedDriverId = driverId; task.assignmentId = assignment.id; task.assignedAt = Date.now(); task.status = "assigned"; task.version += 1;
    driver.availability = "busy"; driver.activeTaskId = taskId; driver.version += 1;
    this.recordDeliveryEvent(taskId, "driver_assigned", `${driver.name} assigned`, "dispatch", assignedBy);
    this.syncTaskMaterialized(task, taskBefore);
    return assignment;
  }

  advanceDriverTask(driverId) {
    const driver = this.driver(driverId);
    if (!driver?.activeTaskId) throw new Error("This driver has no active delivery.");
    const task = this.deliveryTask(driver.activeTaskId);
    const next = nextDriverStatus(task.status);
    if (!next) throw new Error("The next delivery step requires customer PIN confirmation or dispatch action.");
    task.status = next; task.version += 1;
    if (next === "picked_up") { task.pickedUpAt = Date.now(); const order = this.order(task.orderId); if (order) { order.status = "out_for_delivery"; order.version += 1; this.appendOrderEvent(order.id, "order_status_changed", "out_for_delivery", "driver", driver.id); } }
    if (next === "en_route") task.estimatedArrivalAt = Date.now() + 12 * 60_000;
    if (next === "arriving") task.estimatedArrivalAt = Date.now() + 3 * 60_000;
    const event = statusEvent(next, driver.name);
    this.recordDeliveryEvent(task.id, event.type, event.message, "driver", driver.id);
    return task;
  }

  confirmDelivery(driverId, pin) {
    const driver = this.driver(driverId);
    if (!driver?.activeTaskId) throw new Error("This driver has no active delivery.");
    const task = this.deliveryTask(driver.activeTaskId);
    const taskBefore = clone(task);
    if (task.status !== "arriving") throw new Error("Delivery PIN can only be confirmed at the final delivery step.");
    if (String(pin).trim() !== String(task.verification?.pin || "")) throw new Error("Delivery PIN is incorrect.");
    task.status = "delivered"; task.deliveredAt = Date.now(); task.version += 1;
    const order = this.order(task.orderId);
    if (order) { order.status = "completed"; order.version += 1; this.appendOrderEvent(order.id, "order_status_changed", "completed", "driver", driver.id); }
    const assignment = this.state.deliveryAssignments.find(item => item.id === task.assignmentId);
    if (assignment) { assignment.status = "completed"; assignment.version = Number(assignment.version || 1) + 1; }
    driver.availability = "available"; driver.activeTaskId = null; driver.completedDeliveries = Number(driver.completedDeliveries || 0) + 1; driver.version += 1;
    this.state.proofsOfDelivery.push({ id: uid("pod"), taskId: task.id, orderId: task.orderId, driverId: driver.id, method: "customer_pin", confirmedAt: Date.now() });
    this.recordDeliveryEvent(task.id, "delivered", "Delivery completed with customer PIN", "driver", driver.id);
    this.syncTaskMaterialized(task, taskBefore);
    return task;
  }

  updateDriverLocation(driverId, latitude, longitude, accuracyMeters = 15) {
    const existing = this.state.driverLocations.find(item => item.driverId === driverId);
    const now = Date.now();
    const snapshot = { driverId, latitude: Number(latitude), longitude: Number(longitude), geohash: encodeGeohash(latitude, longitude), accuracyMeters, heading: existing?.heading || 0, recordedAt: now, expiresAt: now + Number(this.state.platform.retention.driverLocationMinutes || 30) * 60_000 };
    if (existing) Object.assign(existing, snapshot); else this.state.driverLocations.push(snapshot);
    return snapshot;
  }

  setDriverShift(driverId, shiftStatus) {
    const driver = this.driver(driverId);
    if (!driver || driver.activeTaskId) return null;
    driver.shiftStatus = shiftStatus; driver.availability = shiftStatus === "online" ? "available" : "offline"; driver.version += 1;
    return driver;
  }

  addRating({ orderId, overall, food, service, comment }) {
    const order = this.order(orderId);
    if (!order || order.status !== "completed" || order.rated) throw new Error("Only completed, unrated GoodKota orders can be rated.");
    const values = [overall, food, service].map(Number);
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > 5)) throw new Error("Ratings must be whole numbers from 1 to 5.");
    const rating = { id: uid("rating"), merchantId: order.merchantId, orderId, customerId: order.customerId, verified: true, overall: values[0], food: values[1], service: values[2], comment: String(comment || "").trim(), createdAt: Date.now() };
    this.state.ratings.unshift(rating);
    order.rated = true; order.version += 1;
    this.refreshQualitySummary(order.merchantId, false);
    this.appendAnalyticsEvent({ domain: "quality", type: "verified_rating_added", merchantId: order.merchantId, orderId });
    return rating;
  }

  setQualityWorkflow(merchantId, status, note = "") { const merchant = this.merchant(merchantId); if (!merchant) throw new Error("Merchant not found."); const before = clone(merchant); merchant.qualityWorkflow = { status, note, updatedAt: Date.now() }; merchant.version += 1; this.syncMerchantMaterialized(merchant, before); return merchant; }
  setNearbyNotifications(enabled) { if (this.customer) this.customer.notificationPreferences.nearbyQualityMerchants = Boolean(enabled); }

  updateMerchant(merchantId, changes = {}) {
    const merchant = this.merchant(merchantId); if (!merchant) throw new Error("Merchant not found.");
    for (const key of ["name", "legalName", "address", "area", "latitude", "longitude", "prepMinutes", "deliveryFeeCents", "minOrderCents"]) if (changes[key] !== undefined) merchant[key] = changes[key];
    if (changes.contact) merchant.contact = { ...merchant.contact, ...changes.contact };
    if (changes.delivery) merchant.delivery = { ...merchant.delivery, ...changes.delivery };
    if (changes.deliveryCapability) merchant.deliveryCapability = { ...merchant.deliveryCapability, ...changes.deliveryCapability };
    if (Number.isFinite(Number(merchant.latitude)) && Number.isFinite(Number(merchant.longitude))) merchant.geohash = encodeGeohash(merchant.latitude, merchant.longitude);
    merchant.version += 1;
    return merchant;
  }

  setMerchantCompliance(merchantId, status, note = "", actor = null, reason = "") {
    const merchant = this.merchant(merchantId); if (!merchant) throw new Error("Merchant not found.");
    const allowed = ["pending_review", "compliant", "needs_action", "suspended"]; if (!allowed.includes(status)) throw new Error("Invalid merchant compliance status.");
    const merchantBefore = clone(merchant);
    const before = clone(merchant.compliance || {}); merchant.compliance = { status, note: String(note || "").trim(), updatedAt: Date.now() }; merchant.version += 1;
    this.appendComplianceEvent(merchantId, before, merchant.compliance, actor, reason || note);
    this.syncMerchantMaterialized(merchant, merchantBefore);
    return merchant;
  }

  setMerchantEnabled(merchantId, enabled) { const merchant = this.merchant(merchantId); if (!merchant) throw new Error("Merchant not found."); const before = clone(merchant); merchant.enabled = Boolean(enabled); merchant.version += 1; this.syncMerchantMaterialized(merchant, before); return merchant; }

  saveMerchantSettlement(merchantId, settlement, gatewayAccount, actor = null, reason = "") {
    const merchant = this.merchant(merchantId); if (!merchant) throw new Error("Merchant not found.");
    const merchantBefore = clone(merchant);
    const before = { settlement: clone(merchant.settlement || {}), gatewayAccount: clone(merchant.gatewayAccount || {}) };
    merchant.settlement = settlement; merchant.gatewayAccount = gatewayAccount; merchant.version += 1;
    this.state.settlementEvents.unshift({ id: uid("settlement_event"), merchantId, type: "settlement_configuration_changed", before, after: { settlement, gatewayAccount }, actorId: actor?.id || merchantId, actorRole: actor?.role || "merchant", reason, createdAt: Date.now() });
    this.syncMerchantMaterialized(merchant, merchantBefore);
    return merchant;
  }

  addMerchant(merchant) {
    if (!merchant?.id) merchant.id = uid("merchant");
    if (this.merchant(merchant.id)) throw new Error("Merchant already exists.");
    const item = {
      enabled: true, contact: {}, prepMinutes: 20, deliveryFeeCents: 2000, minOrderCents: 3000,
      delivery: { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" },
      deliveryCapability: { ownDrivers: false, acceptsGoodKotaFleet: true, thirdPartyAllowed: true },
      gatewayAccount: { id: null, status: "not_configured" }, settlement: { bankName: "", accountHolder: "", maskedAccount: "", status: "not_configured" },
      compliance: { status: "pending_review", note: "Awaiting GoodKota Admin review" }, qualityWorkflow: { status: "healthy", note: "" }, commercial: { plan: "Standard", status: "active", note: "" },
      createdAt: Date.now(), version: 1, ...merchant
    };
    if (Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))) item.geohash = encodeGeohash(item.latitude, item.longitude);
    this.state.merchants.push(item); this.refreshQualitySummary(item.id, false); this.syncMerchantMaterialized(item, null, true); return item;
  }

  addProduct(product) { const item = { id: product.id || uid("product"), createdAt: Date.now(), version: 1, enabled: true, ...product }; this.state.products.push(item); return item; }
  platformActor(role) { return this.state.platformStaff.find(person => person.role === role && person.active !== false) || null; }

  logAudit({ actor, action, targetType = "platform", targetId = "goodkota", reason = "", visibility = "operations", metadata = {} }) {
    const event = { id: uid("audit"), actorId: actor?.id || "system", actorRole: actor?.role || "system", actorName: actor?.name || "System", action, targetType, targetId, reason: String(reason || "").trim(), visibility, metadata, createdAt: Date.now() };
    this.state.auditTrail.unshift(event); return event;
  }

  updatePlatformControl(key, value, actor, reason) {
    if (actor?.role !== "owner") throw new Error("Owner authority is required for company-wide controls.");
    if (!(key in this.state.platform.controls)) throw new Error("Unknown platform control.");
    const before = this.state.platform.controls[key]; this.state.platform.controls[key] = Boolean(value);
    if (key === "paymentsEnabled" && this.state.platform.paymentGateway) this.state.platform.paymentGateway.enabled = Boolean(value);
    if (key === "deliveryEnabled" && this.state.platform.delivery) this.state.platform.delivery.enabled = Boolean(value);
    this.logAudit({ actor, action: "platform_control_changed", targetType: "platform_control", targetId: key, reason, visibility: "owner", metadata: { before, after: Boolean(value) } });
    return this.state.platform.controls;
  }

  addPlatformStaff({ name, email, role = "admin", authUid = null }, actor, reason = "") {
    if (actor?.role !== "owner") throw new Error("Only a GoodKota Owner can grant platform authority.");
    if (!["owner", "admin"].includes(role)) throw new Error("Invalid platform role.");
    const member = { id: uid("staff"), authUid, name: String(name || "").trim(), email: String(email || "").trim(), role, active: true, createdAt: Date.now(), version: 1 };
    if (!member.name || !member.email) throw new Error("Name and email are required.");
    this.state.platformStaff.push(member);
    this.logAudit({ actor, action: "platform_staff_added", targetType: "platform_staff", targetId: member.id, reason, visibility: "owner", metadata: { role, email: member.email } });
    return member;
  }

  updatePlatformStaff(staffId, changes, actor, reason = "") {
    if (actor?.role !== "owner") throw new Error("Only a GoodKota Owner can change platform authority.");
    const member = this.state.platformStaff.find(person => person.id === staffId); if (!member) throw new Error("Platform staff member not found.");
    const nextRole = changes.role ?? member.role; const nextActive = changes.active ?? member.active;
    if (!["owner", "admin"].includes(nextRole)) throw new Error("Invalid platform role.");
    const activeOwnersAfter = this.state.platformStaff.filter(person => person.id === staffId ? nextRole === "owner" && nextActive !== false : person.role === "owner" && person.active !== false).length;
    if (activeOwnersAfter < 1) throw new Error("GoodKota must always retain at least one active Owner.");
    const before = { role: member.role, active: member.active !== false, authUid: member.authUid || null };
    member.role = nextRole; member.active = Boolean(nextActive); if (changes.name !== undefined) member.name = String(changes.name || "").trim(); if (changes.email !== undefined) member.email = String(changes.email || "").trim(); if (changes.authUid !== undefined) member.authUid = changes.authUid || null; member.version += 1;
    this.logAudit({ actor, action: "platform_staff_authority_changed", targetType: "platform_staff", targetId: staffId, reason, visibility: "owner", metadata: { before, after: { role: member.role, active: member.active, authUid: member.authUid } } });
    return member;
  }

  publishAnnouncement({ title, message, audience = "all", severity = "info" }, actor) {
    if (!actor || !["owner", "admin"].includes(actor.role)) throw new Error("GoodKota platform authority is required.");
    const item = { id: uid("announcement"), title: String(title || "").trim(), message: String(message || "").trim(), audience, severity, active: true, createdBy: actor.id, createdAt: Date.now() };
    if (!item.title || !item.message) throw new Error("Title and message are required.");
    this.state.announcements.unshift(item); this.logAudit({ actor, action: "announcement_published", targetType: "announcement", targetId: item.id, reason: item.title, visibility: "operations", metadata: { audience, severity } }); return item;
  }

  setAnnouncementActive(announcementId, active, actor) { if (!actor || !["owner", "admin"].includes(actor.role)) throw new Error("GoodKota platform authority is required."); const item = this.state.announcements.find(entry => entry.id === announcementId); if (!item) throw new Error("Announcement not found."); item.active = Boolean(active); this.logAudit({ actor, action: active ? "announcement_reactivated" : "announcement_closed", targetType: "announcement", targetId: announcementId, reason: item.title, visibility: "operations" }); return item; }

  addSupportCase({ source = "merchant", sourceId = null, sourceName = "", merchantId = null, subject, message, priority = "normal" }, actor = null) {
    const item = { id: uid("case"), source, sourceId, sourceName: String(sourceName || "").trim(), merchantId, subject: String(subject || "").trim(), message: String(message || "").trim(), priority, status: "open", assignedTo: null, createdAt: Date.now(), updatedAt: Date.now(), resolutionNote: "", version: 1 };
    if (!item.subject || !item.message) throw new Error("Subject and message are required.");
    this.state.supportCases.unshift(item);
    const effectiveActor = actor || { id: sourceId || merchantId || source, role: source, name: item.sourceName || "Stakeholder" };
    this.appendSupportEvent(item.id, "case_created", effectiveActor, item.message, { priority });
    this.logAudit({ actor: effectiveActor, action: "support_case_created", targetType: "support_case", targetId: item.id, reason: item.subject, visibility: "operations", metadata: { priority } });
    this.syncSupportMaterialized(item, null, true); return item;
  }

  updateSupportCase(caseId, { status, assignedTo, resolutionNote }, actor) {
    if (!actor || !["owner", "admin"].includes(actor.role)) throw new Error("GoodKota platform authority is required.");
    const item = this.state.supportCases.find(entry => entry.id === caseId); if (!item) throw new Error("Support case not found.");
    const itemBefore = clone(item);
    const before = { status: item.status, assignedTo: item.assignedTo, resolutionNote: item.resolutionNote };
    if (status !== undefined) item.status = status; if (assignedTo !== undefined) item.assignedTo = assignedTo; if (resolutionNote !== undefined) item.resolutionNote = String(resolutionNote || "").trim(); item.updatedAt = Date.now(); item.version += 1;
    this.appendSupportEvent(caseId, "case_updated", actor, item.resolutionNote || item.subject, { before, after: { status: item.status, assignedTo: item.assignedTo } });
    this.logAudit({ actor, action: "support_case_updated", targetType: "support_case", targetId: caseId, reason: item.resolutionNote || item.subject, visibility: "operations", metadata: { status: item.status, assignedTo: item.assignedTo } });
    this.syncSupportMaterialized(item, itemBefore); return item;
  }

  setMerchantCommercial(merchantId, { plan, status, note }, actor, reason = "") {
    if (!actor || !["owner", "admin"].includes(actor.role)) throw new Error("GoodKota platform authority is required.");
    const merchant = this.merchant(merchantId); if (!merchant) throw new Error("Merchant not found.");
    const merchantBefore = clone(merchant);
    const before = clone(merchant.commercial || {}); merchant.commercial = { plan: plan || before.plan || "Standard", status: status || before.status || "active", note: String(note ?? before.note ?? "").trim(), updatedAt: Date.now() }; merchant.version += 1;
    this.appendCommercialEvent(merchantId, before, merchant.commercial, actor, reason); this.logAudit({ actor, action: "merchant_commercial_status_changed", targetType: "merchant", targetId: merchantId, reason, visibility: "operations", metadata: { before, after: merchant.commercial } }); this.syncMerchantMaterialized(merchant, merchantBefore); return merchant;
  }

  findIdempotency(key) { return this.state.idempotencyRecords.find(record => record.key === key && (!record.expiresAt || record.expiresAt > Date.now())) || null; }
  rememberIdempotency(key, command, result, ttlMs = 24 * 60 * 60_000) { const record = { id: uid("idem"), key, command, result, createdAt: Date.now(), expiresAt: Date.now() + ttlMs }; this.state.idempotencyRecords.unshift(record); return record; }
  enqueueJob({ type, payload, idempotencyKey }) { if (idempotencyKey && this.state.jobs.some(job => job.idempotencyKey === idempotencyKey)) return null; const job = { id: uid("job"), type, payload, idempotencyKey, status: "queued", attempts: 0, createdAt: Date.now(), updatedAt: Date.now() }; this.state.jobs.push(job); return job; }
}
