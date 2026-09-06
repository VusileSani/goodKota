import { seed } from "../data/seed.js";
import { assessQuality, summariseRatings } from "../services/quality-service.js";
import { nextDriverStatus, statusEvent, taskForOrder } from "../services/delivery-service.js";
import { uid } from "./utils.js";

const STORAGE_KEY = "goodkota_foundation_v4";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class AppStore {
  constructor() {
    this.state = this.load();
    this.ensureDeliveryCollections();
    this.refreshQualitySummaries(false);
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return saved || clone(seed);
    } catch {
      return clone(seed);
    }
  }

  ensureDeliveryCollections() {
    for (const key of ["drivers", "driverVehicles", "driverLocations", "deliveryTasks", "deliveryAssignments", "deliveryEvents", "proofsOfDelivery"]) {
      if (!Array.isArray(this.state[key])) this.state[key] = [];
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  reset() {
    this.state = clone(seed);
    this.ensureDeliveryCollections();
    this.refreshQualitySummaries();
  }

  get customer() {
    return this.state.users.find(user => user.role === "customer");
  }

  merchant(id) { return this.state.merchants.find(item => item.id === id); }
  outlet(id) { return this.state.outlets.find(item => item.id === id); }
  product(id) { return this.state.products.find(item => item.id === id); }
  driver(id) { return this.state.drivers.find(item => item.id === id); }
  vehicle(id) { return this.state.driverVehicles.find(item => item.id === id); }
  deliveryTask(id) { return this.state.deliveryTasks.find(item => item.id === id); }
  order(id) { return this.state.orders.find(item => item.id === id); }
  deliveryTaskForOrder(orderId) { return taskForOrder(this.state, orderId); }

  productsForOutlet(outletId) {
    return this.state.products.filter(product => product.enabled && product.outletIds.includes(outletId));
  }

  ratingsForOutlet(outletId) {
    return this.state.ratings.filter(rating => rating.outletId === outletId);
  }

  refreshQualitySummaries(persist = true) {
    this.state.outlets.forEach(outlet => {
      const summary = summariseRatings(this.ratingsForOutlet(outlet.id));
      outlet.qualitySummary = { ...summary, ...assessQuality(summary) };

      if (outlet.qualitySummary.signal === "alert" && outlet.qualityWorkflow.status === "healthy") {
        outlet.qualityWorkflow.status = "watch";
        outlet.qualityWorkflow.note = "Automatically flagged by verified customer ratings";
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
    const outlet = this.outlet(order.outletId);
    const destination = order.fulfilment?.destination;
    if (!outlet || !destination) return;

    const providerType = order.fulfilment.provider || outlet.delivery?.providerPreference || "goodkota_fleet";
    const task = {
      id: uid("delivery"),
      orderId: order.id,
      merchantId: order.merchantId,
      outletId: order.outletId,
      providerType,
      status: "awaiting_prep",
      assignedDriverId: null,
      assignmentId: null,
      deliveryFee: order.deliveryFee || 0,
      pickup: { address: outlet.name, latitude: outlet.latitude, longitude: outlet.longitude },
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
    const order = this.state.orders.find(item => item.id === orderId);
    if (!order) return;
    order.status = status;

    const task = this.deliveryTaskForOrder(orderId);
    if (task && status === "ready") {
      task.status = "ready_for_dispatch";
      task.readyAt = Date.now();
      this.recordDeliveryEvent(task.id, "outlet_ready", "Outlet marked order ready", "merchant", order.merchantId);
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
    if (task.status !== "ready_for_dispatch") throw new Error("This delivery must be marked ready by the outlet before driver assignment.");

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
      const order = this.state.orders.find(item => item.id === task.orderId);
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
    const order = this.state.orders.find(item => item.id === task.orderId);
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
    const order = this.state.orders.find(item => item.id === orderId);
    if (!order || order.status !== "completed" || order.rated) {
      throw new Error("Only completed, unrated GoodKota orders can be rated.");
    }

    this.state.ratings.unshift({
      id: uid("rating"), outletId: order.outletId, orderId, customerId: order.customerId,
      verified: true, overall: Number(overall), food: Number(food), service: Number(service),
      comment: String(comment || "").trim(), createdAt: Date.now()
    });
    order.rated = true;
    this.refreshQualitySummaries();
  }

  setQualityWorkflow(outletId, status, note = "") {
    const outlet = this.outlet(outletId);
    if (!outlet) return;
    outlet.qualityWorkflow = { status, note };
    this.save();
  }

  setNearbyNotifications(enabled) {
    this.customer.notificationPreferences.nearbyQualityOutlets = Boolean(enabled);
    this.save();
  }

  saveMerchantSettlement(merchantId, settlement, gatewayAccount) {
    const merchant = this.merchant(merchantId);
    if (!merchant) return;
    merchant.settlement = settlement;
    merchant.gatewayAccount = gatewayAccount;
    this.save();
  }

  addMerchantWithPrimaryOutlet({ merchant, outlet }) {
    if (!merchant?.id || !outlet?.id) throw new Error("Merchant and primary outlet are required.");
    if (this.merchant(merchant.id) || this.outlet(outlet.id)) throw new Error("Merchant or outlet already exists.");

    this.state.merchants.push({
      enabled: true,
      contact: {},
      deliveryCapability: { ownDrivers: false, acceptsGoodKotaFleet: true, thirdPartyAllowed: true },
      gatewayAccount: { id: null, status: "not_configured" },
      settlement: { bankName: "", accountHolder: "", maskedAccount: "", status: "not_configured" },
      ...merchant,
      primaryOutletId: outlet.id
    });

    this.state.outlets.push({
      enabled: true,
      prepMinutes: 20,
      deliveryFee: 20,
      minOrder: 30,
      delivery: { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" },
      qualityWorkflow: { status: "healthy", note: "" },
      ...outlet,
      merchantId: merchant.id
    });

    this.refreshQualitySummaries(false);
    this.save();
  }

  addOutlet(merchantId, outlet) {
    const merchant = this.merchant(merchantId);
    if (!merchant) throw new Error("Merchant not found.");
    if (!outlet?.id || this.outlet(outlet.id)) throw new Error("A valid new outlet is required.");

    this.state.outlets.push({
      enabled: true,
      prepMinutes: 20,
      deliveryFee: 20,
      minOrder: 30,
      delivery: { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" },
      qualityWorkflow: { status: "healthy", note: "" },
      ...outlet,
      merchantId
    });
    this.refreshQualitySummaries(false);
    this.save();
  }

  addProduct(product) {
    this.state.products.push(product);
    this.save();
  }
}
