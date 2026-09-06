import { seed } from "../data/seed.js";
import { assessQuality, summariseRatings } from "../services/quality-service.js";
import { nextDriverStatus, statusEvent, taskForOrder } from "../services/delivery-service.js";
import { uid } from "./utils.js";

const STORAGE_KEY = "goodkota_foundation_v4";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normaliseDeliveryStatus(status) {
  if (status === "driver_to_outlet") return "driver_to_pickup";
  if (status === "at_outlet") return "at_pickup";
  return status;
}

function mergeLegacyMerchantOutlet(merchant, outlet) {
  return {
    ...merchant,
    name: outlet?.name || merchant.name,
    address: outlet?.address || merchant.address || "",
    area: outlet?.area || merchant.area || outlet?.address?.split(",")[0] || "",
    latitude: outlet?.latitude ?? merchant.latitude ?? null,
    longitude: outlet?.longitude ?? merchant.longitude ?? null,
    enabled: outlet?.enabled ?? merchant.enabled ?? true,
    prepMinutes: outlet?.prepMinutes ?? merchant.prepMinutes ?? 20,
    deliveryFee: outlet?.deliveryFee ?? merchant.deliveryFee ?? 20,
    minOrder: outlet?.minOrder ?? merchant.minOrder ?? 30,
    delivery: { ...(merchant.delivery || {}), ...(outlet?.delivery || {}) },
    qualityWorkflow: { ...(merchant.qualityWorkflow || {}), ...(outlet?.qualityWorkflow || {}) },
    contact: merchant.contact || {},
    compliance: merchant.compliance || { status: "pending_review", note: "" }
  };
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

  state.merchants.forEach(merchant => {
    const related = state.outlets.filter(outlet => outlet.merchantId === merchant.id);
    const primary = related.find(outlet => outlet.id === merchant.primaryOutletId) || related[0] || null;

    const primaryMerchant = mergeLegacyMerchantOutlet(merchant, primary);
    delete primaryMerchant.primaryOutletId;
    migratedMerchants.push(primaryMerchant);
    if (primary) outletToMerchant.set(primary.id, primaryMerchant.id);

    related.filter(outlet => outlet.id !== primary?.id).forEach(outlet => {
      const id = `${merchant.id}_${outlet.id}`;
      outletToMerchant.set(outlet.id, id);
      migratedMerchants.push(mergeLegacyMerchantOutlet({
        ...merchant,
        id,
        name: outlet.name,
        contact: { ...(merchant.contact || {}) }
      }, outlet));
    });
  });

  state.outlets.forEach(outlet => {
    if (outletToMerchant.has(outlet.id)) return;
    const id = outlet.merchantId || `merchant_${outlet.id}`;
    outletToMerchant.set(outlet.id, id);
    migratedMerchants.push(mergeLegacyMerchantOutlet({
      id,
      name: outlet.name,
      legalName: outlet.name,
      contact: {},
      compliance: { status: "pending_review", note: "Migrated from earlier GoodKota prototype" }
    }, outlet));
  });

  const productCopies = [];
  (state.products || []).forEach(product => {
    const legacyOutletIds = Array.isArray(product.outletIds) ? product.outletIds : [];
    if (!legacyOutletIds.length) {
      const copy = { ...product };
      delete copy.outletIds;
      productCopies.push(copy);
      return;
    }

    const merchantIds = [...new Set(legacyOutletIds.map(id => outletToMerchant.get(id)).filter(Boolean))];
    merchantIds.forEach((merchantId, index) => {
      const copy = { ...product, merchantId, id: index === 0 ? product.id : `${product.id}_${merchantId}` };
      delete copy.outletIds;
      productCopies.push(copy);
    });
  });

  (state.orders || []).forEach(order => {
    if (order.outletId && outletToMerchant.get(order.outletId)) order.merchantId = outletToMerchant.get(order.outletId);
    delete order.outletId;
  });

  (state.ratings || []).forEach(rating => {
    if (rating.outletId && outletToMerchant.get(rating.outletId)) rating.merchantId = outletToMerchant.get(rating.outletId);
    delete rating.outletId;
  });

  (state.qualityCases || []).forEach(item => {
    if (item.outletId && outletToMerchant.get(item.outletId)) item.merchantId = outletToMerchant.get(item.outletId);
    delete item.outletId;
  });

  (state.deliveryTasks || []).forEach(task => {
    if (task.outletId && outletToMerchant.get(task.outletId)) task.merchantId = outletToMerchant.get(task.outletId);
    task.status = normaliseDeliveryStatus(task.status);
    delete task.outletId;
  });

  (state.deliveryEvents || []).forEach(event => {
    if (event.type === "outlet_ready") event.type = "merchant_ready";
    event.message = String(event.message || "").replace(/outlet/gi, "merchant");
  });

  state.merchants = migratedMerchants;
  state.products = productCopies;
  delete state.outlets;
  return state;
}

export class AppStore {
  constructor() {
    this.state = this.load();
    migrateLegacyMerchantOutletModel(this.state);
    this.ensureCollections();
    this.ensureMerchantAdministration();
    this.refreshQualitySummaries(false);
    this.save();
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return saved || clone(seed);
    } catch {
      return clone(seed);
    }
  }

  ensureCollections() {
    for (const key of ["merchants", "products", "orders", "ratings", "payments", "drivers", "driverVehicles", "driverLocations", "deliveryTasks", "deliveryAssignments", "deliveryEvents", "proofsOfDelivery"]) {
      if (!Array.isArray(this.state[key])) this.state[key] = [];
    }
  }

  ensureMerchantAdministration() {
    this.state.users?.forEach(user => {
      if (user.role === "customer" && user.notificationPreferences) {
        if (user.notificationPreferences.nearbyQualityMerchants === undefined) {
          user.notificationPreferences.nearbyQualityMerchants = Boolean(user.notificationPreferences.nearbyQualityOutlets);
        }
        delete user.notificationPreferences.nearbyQualityOutlets;
      }
    });

    this.state.merchants.forEach(merchant => {
      if (!merchant.contact) merchant.contact = {};
      if (!merchant.compliance) {
        merchant.compliance = {
          status: merchant.settlement?.status === "verified" ? "compliant" : "pending_review",
          note: ""
        };
      }
      if (!merchant.delivery) merchant.delivery = { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" };
      if (!merchant.qualityWorkflow) merchant.qualityWorkflow = { status: "healthy", note: "" };
      if (merchant.prepMinutes === undefined) merchant.prepMinutes = 20;
      if (merchant.deliveryFee === undefined) merchant.deliveryFee = 20;
      if (merchant.minOrder === undefined) merchant.minOrder = 30;
    });
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  reset() {
    this.state = clone(seed);
    this.ensureCollections();
    this.ensureMerchantAdministration();
    this.refreshQualitySummaries();
  }

  get customer() {
    return this.state.users.find(user => user.role === "customer");
  }

  merchant(id) { return this.state.merchants.find(item => item.id === id); }
  product(id) { return this.state.products.find(item => item.id === id); }
  driver(id) { return this.state.drivers.find(item => item.id === id); }
  vehicle(id) { return this.state.driverVehicles.find(item => item.id === id); }
  deliveryTask(id) { return this.state.deliveryTasks.find(item => item.id === id); }
  order(id) { return this.state.orders.find(item => item.id === id); }
  deliveryTaskForOrder(orderId) { return taskForOrder(this.state, orderId); }

  productsForMerchant(merchantId) {
    return this.state.products.filter(product => product.enabled && product.merchantId === merchantId);
  }

  ratingsForMerchant(merchantId) {
    return this.state.ratings.filter(rating => rating.merchantId === merchantId);
  }

  refreshQualitySummaries(persist = true) {
    this.state.merchants.forEach(merchant => {
      const summary = summariseRatings(this.ratingsForMerchant(merchant.id));
      merchant.qualitySummary = { ...summary, ...assessQuality(summary) };

      if (merchant.qualitySummary.signal === "alert" && merchant.qualityWorkflow.status === "healthy") {
        merchant.qualityWorkflow.status = "watch";
        merchant.qualityWorkflow.note = "Automatically flagged by verified customer ratings";
      }
    });
    if (persist) this.save();
  }

  addOrder(order) {
    this.state.orders.unshift(order);
    if (order.fulfilment?.type === "delivery") this.createDeliveryTaskForOrder(order);
    this.save();
  }

  createDeliveryTaskForOrder(order) {
    if (this.deliveryTaskForOrder(order.id)) return;
    const merchant = this.merchant(order.merchantId);
    const destination = order.fulfilment?.destination;
    if (!merchant || !destination) return;

    const providerType = order.fulfilment.provider || merchant.delivery?.providerPreference || "goodkota_fleet";
    const task = {
      id: uid("delivery"),
      orderId: order.id,
      merchantId: order.merchantId,
      providerType,
      status: "awaiting_prep",
      assignedDriverId: null,
      assignmentId: null,
      deliveryFee: order.deliveryFee || 0,
      pickup: { address: `${merchant.name}, ${merchant.address}`, latitude: merchant.latitude, longitude: merchant.longitude },
      dropoff: { address: destination.address, latitude: destination.latitude, longitude: destination.longitude },
      verification: { method: "pin", demoPin: String(Math.floor(1000 + Math.random() * 9000)) },
      createdAt: Date.now(),
      readyAt: null,
      assignedAt: null,
      pickedUpAt: null,
      estimatedArrivalAt: null,
      deliveredAt: null
    };
    this.state.deliveryTasks.unshift(task);
    this.recordDeliveryEvent(task.id, "delivery_created", "Delivery task created", "system", "goodkota");
  }

  addPayment(payment) {
    this.state.payments.unshift(payment);
    this.save();
  }

  updateOrderStatus(orderId, status) {
    const order = this.order(orderId);
    if (!order) return;
    order.status = status;

    const task = this.deliveryTaskForOrder(orderId);
    if (task && status === "ready") {
      task.status = "ready_for_dispatch";
      task.readyAt = Date.now();
      this.recordDeliveryEvent(task.id, "merchant_ready", "Merchant marked order ready", "merchant", order.merchantId);
    }
    this.save();
  }

  recordDeliveryEvent(taskId, type, message, actorType = "system", actorId = "goodkota", metadata = {}) {
    this.state.deliveryEvents.push({
      id: uid("event"), taskId, type, message, actorType, actorId, metadata, createdAt: Date.now()
    });
  }

  assignDriver(taskId, driverId, assignedBy = "dispatch") {
    const task = this.deliveryTask(taskId);
    const driver = this.driver(driverId);
    if (!task || !driver) throw new Error("Delivery task or driver not found.");
    if (driver.availability !== "available") throw new Error("Driver is not currently available.");
    if (task.status !== "ready_for_dispatch") throw new Error("This delivery must be marked ready by the merchant before driver assignment.");

    const assignment = {
      id: uid("assignment"), taskId, driverId, status: "active", assignedBy, assignedAt: Date.now()
    };
    this.state.deliveryAssignments.push(assignment);
    task.assignedDriverId = driverId;
    task.assignmentId = assignment.id;
    task.assignedAt = Date.now();
    task.status = "assigned";
    driver.availability = "busy";
    driver.activeTaskId = taskId;
    this.recordDeliveryEvent(taskId, "driver_assigned", `${driver.name} assigned`, "dispatch", assignedBy);
    this.save();
  }

  advanceDriverTask(driverId) {
    const driver = this.driver(driverId);
    if (!driver?.activeTaskId) throw new Error("This driver has no active delivery.");
    const task = this.deliveryTask(driver.activeTaskId);
    const next = nextDriverStatus(task.status);
    if (!next) throw new Error("The next delivery step requires customer PIN confirmation or dispatch action.");

    task.status = next;
    if (next === "picked_up") {
      task.pickedUpAt = Date.now();
      const order = this.order(task.orderId);
      if (order) order.status = "out_for_delivery";
    }
    if (next === "en_route") task.estimatedArrivalAt = Date.now() + 12 * 60_000;
    if (next === "arriving") task.estimatedArrivalAt = Date.now() + 3 * 60_000;

    const event = statusEvent(next, driver.name);
    this.recordDeliveryEvent(task.id, event.type, event.message, "driver", driver.id);
    this.save();
  }

  confirmDelivery(driverId, pin) {
    const driver = this.driver(driverId);
    if (!driver?.activeTaskId) throw new Error("This driver has no active delivery.");
    const task = this.deliveryTask(driver.activeTaskId);
    if (task.status !== "arriving") throw new Error("Delivery PIN can only be confirmed at the final delivery step.");
    if (String(pin).trim() !== String(task.verification?.demoPin || "")) throw new Error("Delivery PIN is incorrect.");

    task.status = "delivered";
    task.deliveredAt = Date.now();
    const order = this.order(task.orderId);
    if (order) order.status = "completed";

    const assignment = this.state.deliveryAssignments.find(item => item.id === task.assignmentId);
    if (assignment) assignment.status = "completed";
    driver.availability = "available";
    driver.activeTaskId = null;
    driver.completedDeliveries = Number(driver.completedDeliveries || 0) + 1;

    this.state.proofsOfDelivery.push({
      id: uid("pod"), taskId: task.id, orderId: task.orderId, driverId: driver.id,
      method: "customer_pin", confirmedAt: Date.now()
    });
    this.recordDeliveryEvent(task.id, "delivered", "Delivery completed with customer PIN", "driver", driver.id);
    this.save();
  }

  updateDriverLocation(driverId, latitude, longitude, accuracyMeters = 15) {
    const existing = this.state.driverLocations.find(item => item.driverId === driverId);
    const snapshot = { driverId, latitude, longitude, accuracyMeters, heading: existing?.heading || 0, recordedAt: Date.now() };
    if (existing) Object.assign(existing, snapshot);
    else this.state.driverLocations.push(snapshot);
    this.save();
  }

  setDriverShift(driverId, shiftStatus) {
    const driver = this.driver(driverId);
    if (!driver || driver.activeTaskId) return;
    driver.shiftStatus = shiftStatus;
    driver.availability = shiftStatus === "online" ? "available" : "offline";
    this.save();
  }

  addRating({ orderId, overall, food, service, comment }) {
    const order = this.order(orderId);
    if (!order || order.status !== "completed" || order.rated) {
      throw new Error("Only completed, unrated GoodKota orders can be rated.");
    }

    this.state.ratings.unshift({
      id: uid("rating"), merchantId: order.merchantId, orderId, customerId: order.customerId,
      verified: true, overall: Number(overall), food: Number(food), service: Number(service),
      comment: String(comment || "").trim(), createdAt: Date.now()
    });
    order.rated = true;
    this.refreshQualitySummaries();
  }

  setQualityWorkflow(merchantId, status, note = "") {
    const merchant = this.merchant(merchantId);
    if (!merchant) return;
    merchant.qualityWorkflow = { status, note };
    this.save();
  }

  setNearbyNotifications(enabled) {
    this.customer.notificationPreferences.nearbyQualityMerchants = Boolean(enabled);
    this.save();
  }

  updateMerchant(merchantId, changes = {}) {
    const merchant = this.merchant(merchantId);
    if (!merchant) throw new Error("Merchant not found.");

    for (const key of ["name", "legalName", "address", "area", "latitude", "longitude", "prepMinutes", "deliveryFee", "minOrder"]) {
      if (changes[key] !== undefined) merchant[key] = changes[key];
    }
    if (changes.contact) merchant.contact = { ...merchant.contact, ...changes.contact };
    if (changes.delivery) merchant.delivery = { ...merchant.delivery, ...changes.delivery };
    if (changes.deliveryCapability) merchant.deliveryCapability = { ...merchant.deliveryCapability, ...changes.deliveryCapability };
    this.save();
  }

  setMerchantCompliance(merchantId, status, note = "") {
    const merchant = this.merchant(merchantId);
    if (!merchant) throw new Error("Merchant not found.");
    const allowed = ["pending_review", "compliant", "needs_action", "suspended"];
    if (!allowed.includes(status)) throw new Error("Invalid merchant compliance status.");
    merchant.compliance = { status, note: String(note || "").trim(), updatedAt: Date.now() };
    this.save();
  }

  setMerchantEnabled(merchantId, enabled) {
    const merchant = this.merchant(merchantId);
    if (!merchant) throw new Error("Merchant not found.");
    merchant.enabled = Boolean(enabled);
    this.save();
  }

  saveMerchantSettlement(merchantId, settlement, gatewayAccount) {
    const merchant = this.merchant(merchantId);
    if (!merchant) return;
    merchant.settlement = settlement;
    merchant.gatewayAccount = gatewayAccount;
    this.save();
  }

  addMerchant(merchant) {
    if (!merchant?.id) throw new Error("Merchant is required.");
    if (this.merchant(merchant.id)) throw new Error("Merchant already exists.");

    this.state.merchants.push({
      enabled: true,
      contact: {},
      prepMinutes: 20,
      deliveryFee: 20,
      minOrder: 30,
      delivery: { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" },
      deliveryCapability: { ownDrivers: false, acceptsGoodKotaFleet: true, thirdPartyAllowed: true },
      gatewayAccount: { id: null, status: "not_configured" },
      settlement: { bankName: "", accountHolder: "", maskedAccount: "", status: "not_configured" },
      compliance: { status: "pending_review", note: "Awaiting GoodKota Office review" },
      qualityWorkflow: { status: "healthy", note: "" },
      ...merchant
    });

    this.refreshQualitySummaries(false);
    this.save();
  }

  addProduct(product) {
    this.state.products.push(product);
    this.save();
  }
}
