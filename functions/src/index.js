import { randomInt, createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { REGION, PLATFORM_CONFIG, ALLOWED_ORDER_TRANSITIONS, cents } from "./config.js";
import { requireAuth, requireRole } from "./auth.js";
import { auditEvent } from "./audit.js";
import { verifyPaymentWebhook } from "./payment-provider.js";
import { encodeGeohash } from "./geo.js";
import { enforceRateLimit } from "./rate-limit.js";
import { incrementMetric } from "./aggregates.js";

initializeApp();
const db = getFirestore();
const serverTime = () => FieldValue.serverTimestamp();
const text = value => String(value ?? "").trim();
const nowDate = () => new Date();

async function merchantMembership(uid, merchantId) {
  if (!uid || !merchantId) return false;
  const snap = await db.doc(`merchantMemberships/${uid}_${merchantId}`).get();
  return snap.exists && snap.data().active === true;
}

async function platformControls(tx = null) {
  const ref = db.doc(PLATFORM_CONFIG);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return {
    maintenanceMode: false,
    orderingEnabled: true,
    paymentsEnabled: true,
    deliveryEnabled: true,
    merchantOnboardingEnabled: true,
    ...(snap.data()?.controls || {})
  };
}

function validCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function normaliseItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("At least one order item is required.");
  return items.map(item => {
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error("Invalid order quantity.");
    return {
      productId: text(item.productId) || null,
      name: text(item.name).slice(0, 160),
      qty,
      priceCents: cents(item.priceCents)
    };
  });
}

function assertMerchantOperational(merchant) {
  if (!merchant?.enabled) throw new Error("Merchant is disabled.");
  if (merchant.commercial?.status === "suspended") throw new Error("Merchant commercial access is suspended.");
  if (merchant.compliance?.status === "suspended") throw new Error("Merchant compliance status is suspended.");
  if (merchant.qualityWorkflow?.status === "suspended") throw new Error("Merchant quality status is suspended.");
}

function supportPriority(value) {
  const allowed = ["low", "normal", "high", "urgent"];
  return allowed.includes(value) ? value : "normal";
}

async function driverForAuth(uid) {
  const snap = await db.collection("drivers")
    .where("authUid", "==", uid)
    .where("enabled", "==", true)
    .limit(1)
    .get();
  if (snap.empty) throw new HttpsError("permission-denied", "Driver identity is not configured.");
  return snap.docs[0];
}

export const transitionMerchantOrder = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const { orderId, status } = request.data || {};
  if (!orderId || !status) throw new HttpsError("invalid-argument", "orderId and status are required.");
  const orderRef = db.doc(`orders/${orderId}`);

  return db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnap.data();
    if (!(await merchantMembership(auth.uid, order.merchantId))) throw new HttpsError("permission-denied", "Merchant membership required.");
    if (!(ALLOWED_ORDER_TRANSITIONS[order.status] || []).includes(status)) throw new HttpsError("failed-precondition", "Invalid order transition.");

    const taskQuery = status === "ready"
      ? await tx.get(db.collection("deliveryTasks").where("orderId", "==", orderId).limit(1))
      : null;

    tx.update(orderRef, { status, version: FieldValue.increment(1), updatedAt: serverTime() });
    tx.create(db.collection("orderEvents").doc(), {
      orderId, type: "order_status_changed", status,
      actorType: "merchant", actorUid: auth.uid, createdAt: serverTime()
    });

    if (taskQuery && !taskQuery.empty) {
      const taskRef = taskQuery.docs[0].ref;
      tx.update(taskRef, { status: "ready_for_dispatch", readyAt: serverTime(), version: FieldValue.increment(1) });
      tx.create(db.collection("deliveryEvents").doc(), {
        taskId: taskRef.id, type: "merchant_ready", message: "Merchant marked order ready",
        actorType: "merchant", actorId: order.merchantId, createdAt: serverTime()
      });
    }
    return { orderId, status };
  });
});

export const assignDriver = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "delivery");
  const { taskId, driverId } = request.data || {};
  if (!taskId || !driverId) throw new HttpsError("invalid-argument", "taskId and driverId are required.");
  const taskRef = db.doc(`deliveryTasks/${taskId}`);
  const driverRef = db.doc(`drivers/${driverId}`);

  return db.runTransaction(async tx => {
    const [taskSnap, driverSnap] = await Promise.all([tx.get(taskRef), tx.get(driverRef)]);
    if (!taskSnap.exists || !driverSnap.exists) throw new HttpsError("not-found", "Delivery task or driver not found.");
    const task = taskSnap.data();
    const driver = driverSnap.data();
    if (task.status !== "ready_for_dispatch" || task.assignedDriverId) throw new HttpsError("aborted", "Delivery was already assigned or changed.");
    if (driver.availability !== "available" || driver.activeTaskId || driver.shiftStatus !== "online" || driver.enabled === false) {
      throw new HttpsError("aborted", "Driver is no longer available.");
    }

    let vehicle = null;
    if (driver.vehicleId) {
      const vehicleSnap = await tx.get(db.doc(`driverVehicles/${driver.vehicleId}`));
      if (vehicleSnap.exists) vehicle = vehicleSnap.data();
    }

    const assignmentRef = db.collection("deliveryAssignments").doc();
    const driverSummary = {
      name: text(driver.name), rating: Number(driver.rating || 0), completedDeliveries: Number(driver.completedDeliveries || 0),
      vehicleType: text(vehicle?.type), vehicleRegistration: text(vehicle?.registration)
    };
    tx.create(assignmentRef, { taskId, driverId, status: "active", assignedBy: auth.uid, assignedAt: serverTime(), version: 1 });
    tx.update(taskRef, {
      assignedDriverId: driverId, assignmentId: assignmentRef.id, assignedAt: serverTime(), status: "assigned",
      driverSummary, version: FieldValue.increment(1)
    });
    tx.update(driverRef, { availability: "busy", activeTaskId: taskId, version: FieldValue.increment(1) });
    tx.create(db.collection("deliveryEvents").doc(), {
      taskId, type: "driver_assigned", message: "Driver assigned", actorType: "dispatch", actorId: auth.uid, createdAt: serverTime()
    });
    return { assignmentId: assignmentRef.id, taskId, driverId };
  });
});

export const setPlatformControl = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "owner");
  const { key, value, reason } = request.data || {};
  if (!text(reason)) throw new HttpsError("invalid-argument", "Owner reason is required.");
  const allowed = ["maintenanceMode", "orderingEnabled", "paymentsEnabled", "deliveryEnabled", "merchantOnboardingEnabled"];
  if (!allowed.includes(key)) throw new HttpsError("invalid-argument", "Unknown platform control.");
  const configRef = db.doc(PLATFORM_CONFIG);

  await db.runTransaction(async tx => {
    const snap = await tx.get(configRef);
    const before = snap.data()?.controls?.[key] ?? null;
    tx.set(configRef, { controls: { ...(snap.data()?.controls || {}), [key]: Boolean(value) }, updatedAt: serverTime() }, { merge: true });
    tx.create(db.collection("platformAudit").doc(), auditEvent({
      actor: auth, action: "platform_control_changed", targetType: "platform_control", targetId: key,
      reason, visibility: "owner", metadata: { before, after: Boolean(value) }, timestamp: serverTime()
    }));
  });
  return { key, value: Boolean(value) };
});

export const updatePlatformAuthority = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "owner");
  const { uid, role, active, reason } = request.data || {};
  if (!uid || !["owner", "admin"].includes(role) || !text(reason)) {
    throw new HttpsError("invalid-argument", "uid, valid role and reason are required.");
  }

  const authService = getAuth();
  const user = await authService.getUser(uid);
  const previousClaims = { ...(user.customClaims || {}) };
  const nextClaims = {
    ...previousClaims,
    goodkotaOwner: role === "owner" && active !== false,
    goodkotaAdmin: role === "admin" && active !== false
  };

  // Custom claims and Firestore cannot share one transaction. Preserve existing
  // claims and compensate on a Firestore failure so authority cannot silently split.
  await authService.setCustomUserClaims(uid, nextClaims);
  try {
    await db.runTransaction(async tx => {
      const staffRef = db.doc(`platformStaff/${uid}`);
      const activeOwners = await tx.get(db.collection("platformStaff").where("role", "==", "owner").where("active", "==", true));
      const existing = await tx.get(staffRef);
      const existingData = existing.data() || {};
      const wouldRemoveActiveOwner = existingData.role === "owner" && existingData.active === true && (role !== "owner" || active === false);
      if (wouldRemoveActiveOwner && activeOwners.size <= 1) {
        throw new HttpsError("failed-precondition", "Yagoya must retain at least one active Owner.");
      }
      tx.set(staffRef, { authUid: uid, role, active: active !== false, updatedAt: serverTime() }, { merge: true });
      tx.create(db.collection("platformAudit").doc(), auditEvent({
        actor: auth, action: "platform_staff_authority_changed", targetType: "platform_staff", targetId: uid,
        reason, visibility: "owner", metadata: { role, active: active !== false }, timestamp: serverTime()
      }));
    });
  } catch (error) {
    await authService.setCustomUserClaims(uid, previousClaims).catch(rollbackError => {
      console.error("authority_claim_rollback_failed", { uid, rollbackError });
    });
    throw error;
  }

  return { uid, role, active: active !== false };
});

export const createMerchant = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const controls = await platformControls();
  if (!controls.merchantOnboardingEnabled) throw new HttpsError("failed-precondition", "Merchant onboarding is paused.");
  const data = request.data || {};
  const name = text(data.name);
  const address = text(data.address);
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!name || !address || !validCoordinate(latitude, longitude)) throw new HttpsError("invalid-argument", "Name, address and valid coordinates are required.");

  const ref = db.collection("merchants").doc();
  const merchant = {
    name, legalName: text(data.legalName || name), address, area: text(data.area), latitude, longitude,
    geohash: encodeGeohash(latitude, longitude), enabled: true,
    prepMinutes: Math.max(1, Math.min(240, Number(data.prepMinutes || 20))),
    deliveryFeeCents: cents(data.deliveryFeeCents || 0), minOrderCents: cents(data.minOrderCents || 0),
    delivery: { enabled: data.delivery?.enabled !== false, radiusKm: Math.max(0, Number(data.delivery?.radiusKm || 7)), providerPreference: text(data.delivery?.providerPreference || "goodkota_fleet") },
    deliveryCapability: { ownDrivers: Boolean(data.deliveryCapability?.ownDrivers), acceptsYagoyaFleet: data.deliveryCapability?.acceptsYagoyaFleet !== false, thirdPartyAllowed: data.deliveryCapability?.thirdPartyAllowed !== false },
    compliance: { status: "pending_review", note: "Awaiting Yagoya Admin review" },
    qualityWorkflow: { status: "healthy", note: "" }, commercial: { plan: text(data.commercial?.plan || "Standard"), status: "active", note: "" },
    settlement: { status: "not_configured" }, gatewayAccount: { status: "not_configured" }, createdAt: serverTime(), version: 1
  };
  await ref.create(merchant);
  await db.collection("platformAudit").add(auditEvent({ actor: auth, action: "merchant_added", targetType: "merchant", targetId: ref.id, reason: "Merchant onboarding", visibility: "operations", timestamp: serverTime() }));
  return { merchantId: ref.id };
});

export const updateMerchantProfile = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { merchantId, reason = "Merchant profile maintenance" } = request.data || {};
  if (!merchantId) throw new HttpsError("invalid-argument", "merchantId is required.");
  const ref = db.doc(`merchants/${merchantId}`);
  const allowed = request.data?.changes || {};

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Merchant not found.");
    const before = snap.data();
    const next = {};
    for (const key of ["name", "legalName", "address", "area", "prepMinutes", "deliveryFeeCents", "minOrderCents", "contact", "delivery", "deliveryCapability"]) {
      if (allowed[key] !== undefined) next[key] = allowed[key];
    }
    if (allowed.latitude !== undefined || allowed.longitude !== undefined) {
      const latitude = Number(allowed.latitude ?? before.latitude);
      const longitude = Number(allowed.longitude ?? before.longitude);
      if (!validCoordinate(latitude, longitude)) throw new HttpsError("invalid-argument", "Valid coordinates are required.");
      next.latitude = latitude; next.longitude = longitude; next.geohash = encodeGeohash(latitude, longitude);
    }
    if (next.deliveryFeeCents !== undefined) next.deliveryFeeCents = cents(next.deliveryFeeCents);
    if (next.minOrderCents !== undefined) next.minOrderCents = cents(next.minOrderCents);
    if (next.name !== undefined) next.name = text(next.name);
    if (next.address !== undefined) next.address = text(next.address);
    tx.update(ref, { ...next, updatedAt: serverTime(), version: FieldValue.increment(1) });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "merchant_details_updated", targetType: "merchant", targetId: merchantId, reason, visibility: "operations", timestamp: serverTime() }));
  });
  return { merchantId };
});

export const setMerchantEnabled = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { merchantId, enabled, reason } = request.data || {};
  if (!merchantId || !text(reason)) throw new HttpsError("invalid-argument", "Merchant and reason are required.");
  const ref = db.doc(`merchants/${merchantId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Merchant not found.");
    tx.update(ref, { enabled: Boolean(enabled), updatedAt: serverTime(), version: FieldValue.increment(1) });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "merchant_enabled_changed", targetType: "merchant", targetId: merchantId, reason, visibility: "operations", metadata: { enabled: Boolean(enabled) }, timestamp: serverTime() }));
  });
  return { merchantId, enabled: Boolean(enabled) };
});

export const createSupportCase = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  await enforceRateLimit(db, { scope: `support-${auth.uid}`, limit: 8, windowSeconds: 60 });
  const data = request.data || {};
  const source = ["customer", "merchant", "driver"].includes(data.source) ? data.source : "customer";
  const subject = text(data.subject).slice(0, 160);
  const message = text(data.message).slice(0, 4000);
  if (!subject || !message) throw new HttpsError("invalid-argument", "Subject and message are required.");

  let sourceId = auth.uid;
  let merchantId = null;
  if (source === "merchant") {
    merchantId = text(data.merchantId);
    if (!merchantId || !(await merchantMembership(auth.uid, merchantId))) throw new HttpsError("permission-denied", "Merchant membership required.");
    sourceId = merchantId;
  } else if (source === "driver") {
    const driverDoc = await driverForAuth(auth.uid);
    sourceId = driverDoc.id;
  }

  const ref = db.collection("supportCases").doc();
  const item = {
    source, sourceId, sourceName: text(data.sourceName).slice(0, 160), merchantId,
    subject, message, priority: supportPriority(data.priority), status: "open", assignedTo: null,
    resolutionNote: "", createdByUid: auth.uid, createdAt: serverTime(), updatedAt: serverTime(), version: 1
  };
  const batch = db.batch();
  batch.create(ref, item);
  batch.create(db.collection("supportCaseEvents").doc(), { caseId: ref.id, type: "case_created", actorUid: auth.uid, actorRole: source, note: message, createdAt: serverTime() });
  await batch.commit();
  return { caseId: ref.id };
});

export const publishAnnouncement = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const data = request.data || {};
  const title = text(data.title).slice(0, 160);
  const message = text(data.message).slice(0, 4000);
  const audiences = ["all", "customers", "merchants", "drivers", "operations", "internal"];
  const severities = ["info", "warning", "danger", "success"];
  if (!title || !message || !audiences.includes(data.audience || "all")) throw new HttpsError("invalid-argument", "Valid announcement details are required.");
  const ref = db.collection("announcements").doc();
  await ref.create({ title, message, audience: data.audience || "all", severity: severities.includes(data.severity) ? data.severity : "info", active: true, createdByUid: auth.uid, createdAt: serverTime() });
  await db.collection("platformAudit").add(auditEvent({ actor: auth, action: "announcement_published", targetType: "announcement", targetId: ref.id, reason: title, visibility: "operations", timestamp: serverTime() }));
  return { announcementId: ref.id };
});

export const setAnnouncementActive = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { announcementId, active } = request.data || {};
  if (!announcementId) throw new HttpsError("invalid-argument", "announcementId is required.");
  const ref = db.doc(`announcements/${announcementId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Announcement not found.");
    tx.update(ref, { active: Boolean(active), updatedAt: serverTime() });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: active ? "announcement_reactivated" : "announcement_closed", targetType: "announcement", targetId: announcementId, reason: text(snap.data().title), visibility: "operations", timestamp: serverTime() }));
  });
  return { announcementId, active: Boolean(active) };
});

export const paymentWebhook = onRequest({ region: REGION }, async (request, response) => {
  try {
    const verified = await verifyPaymentWebhook(request);
    if (!verified?.signatureVerified || verified.status !== "paid") throw new Error("Payment was not verified.");
    const key = text(verified.idempotencyKey || verified.providerReference);
    if (!key || !verified.customerId || !verified.merchantId) throw new Error("Verified payment identity is incomplete.");
    const idemRef = db.doc(`idempotencyRecords/payment_${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`);

    const result = await db.runTransaction(async tx => {
      const [idem, controls] = await Promise.all([tx.get(idemRef), platformControls(tx)]);
      if (idem.exists) return idem.data().result;
      if (controls.maintenanceMode || !controls.orderingEnabled || !controls.paymentsEnabled) throw new Error("Ordering or payments are paused.");

      const merchantRef = db.doc(`merchants/${verified.merchantId}`);
      const merchantSnap = await tx.get(merchantRef);
      if (!merchantSnap.exists) throw new Error("Merchant not found.");
      const merchant = merchantSnap.data();
      assertMerchantOperational(merchant);

      const amountCents = cents(verified.amountCents);
      const deliveryFeeCents = cents(verified.deliveryFeeCents || 0);
      const discountCents = cents(verified.discountCents || 0);
      const tipCents = cents(verified.tipCents || 0);
      const promoCode = text(verified.promoCode).toUpperCase().slice(0, 80);
      const items = normaliseItems(verified.items || []);
      const itemTotalCents = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      if (itemTotalCents + deliveryFeeCents - discountCents + tipCents !== amountCents) throw new Error("Verified payment amount does not match the signed order breakdown.");
      if (itemTotalCents < Number(merchant.minOrderCents || 0)) throw new Error("Order is below merchant minimum.");
      let scheduledFor = null;
      if (verified.scheduledFor) {
        scheduledFor = new Date(verified.scheduledFor);
        if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) throw new Error("Scheduled order time must be in the future.");
      }

      const fulfilment = verified.fulfilment || { type: "pickup" };
      const isDelivery = fulfilment.type === "delivery";
      if (isDelivery && (!controls.deliveryEnabled || merchant.delivery?.enabled === false)) throw new Error("Delivery is currently unavailable.");
      if (isDelivery && !validCoordinate(fulfilment.destination?.latitude, fulfilment.destination?.longitude)) throw new Error("Delivery destination coordinates are required.");

      const orderRef = db.collection("orders").doc();
      const paymentRef = db.collection("paymentTransactions").doc(text(verified.paymentId) || db.collection("paymentTransactions").doc().id);
      const display = `GK-${new Date().getUTCFullYear().toString().slice(-2)}-${orderRef.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()}`;

      let taskRef = null;
      let credentialRef = null;
      let task = null;
      if (isDelivery) {
        taskRef = db.collection("deliveryTasks").doc();
        credentialRef = db.doc(`deliveryCredentials/${taskRef.id}`);
        const pin = String(randomInt(1000, 10000));
        const credentialHash = createHash("sha256").update(pin).digest("hex");
        const providerType = text(fulfilment.provider || merchant.delivery?.providerPreference || "goodkota_fleet");
        task = {
          orderId: orderRef.id, merchantId: verified.merchantId, providerType, status: "awaiting_prep",
          assignedDriverId: null, assignmentId: null, deliveryFeeCents,
          pickup: { address: `${text(merchant.name)}, ${text(merchant.address)}`, latitude: Number(merchant.latitude), longitude: Number(merchant.longitude), geohash: merchant.geohash || encodeGeohash(merchant.latitude, merchant.longitude) },
          dropoff: { address: text(fulfilment.destination.address), latitude: Number(fulfilment.destination.latitude), longitude: Number(fulfilment.destination.longitude), geohash: encodeGeohash(fulfilment.destination.latitude, fulfilment.destination.longitude) },
          verification: { method: "pin", credentialHash }, createdAt: serverTime(), readyAt: null, assignedAt: null,
          pickedUpAt: null, estimatedArrivalAt: null, deliveredAt: null, version: 1
        };
        tx.create(credentialRef, { taskId: taskRef.id, orderId: orderRef.id, customerId: verified.customerId, pin, createdAt: serverTime(), expiresAt: new Date(Date.now() + 48 * 60 * 60_000) });
      }

      const order = {
        id: orderRef.id, orderNumber: display, customerId: verified.customerId, merchantId: verified.merchantId,
        customer: text(verified.customer?.name), phone: text(verified.customer?.phone), email: text(verified.customer?.email),
        amountCents, subtotalCents: itemTotalCents, deliveryFeeCents, discountCents, tipCents, promoCode, scheduledFor, items, fulfilment, paymentStatus: "paid", paymentId: paymentRef.id,
        status: "pending", deliveryTaskId: taskRef?.id || null, createdAt: serverTime(), version: 1, rated: false
      };

      tx.create(paymentRef, {
        paymentId: paymentRef.id, providerReference: text(verified.providerReference), customerId: verified.customerId,
        merchantId: verified.merchantId, orderId: orderRef.id, amountCents, deliveryFeeCents, discountCents, tipCents, promoCode,
        providerStatus: text(verified.providerStatus || verified.status), status: "paid", signatureVerified: true, createdAt: serverTime(), version: 1
      });
      tx.create(db.collection("paymentEvents").doc(), { paymentId: paymentRef.id, orderId: orderRef.id, type: "payment_captured", amountCents, signatureVerified: true, createdAt: serverTime() });
      tx.create(db.collection("feeAllocations").doc(), { orderId: orderRef.id, paymentId: paymentRef.id, merchantId: verified.merchantId, foodAmountCents: itemTotalCents - discountCents, tipAmountCents: tipCents, deliveryAmountCents: deliveryFeeCents, createdAt: serverTime() });
      tx.create(orderRef, order);
      tx.create(db.collection("orderEvents").doc(), { orderId: orderRef.id, type: "order_created", status: "pending", actorType: "system", actorId: "payment_webhook", createdAt: serverTime() });
      if (taskRef) {
        tx.create(taskRef, task);
        tx.create(db.collection("deliveryEvents").doc(), { taskId: taskRef.id, type: "delivery_created", message: "Delivery task created", actorType: "system", actorId: "payment_webhook", createdAt: serverTime() });
      }
      tx.create(db.collection("jobs").doc(), { type: "order_notifications", payload: { orderId: orderRef.id, merchantId: verified.merchantId }, status: "queued", attempts: 0, idempotencyKey: `notify:${orderRef.id}:created`, createdAt: serverTime(), updatedAt: serverTime() });
      const resultValue = { orderId: orderRef.id, orderNumber: display, paymentId: paymentRef.id, deliveryTaskId: taskRef?.id || null };
      tx.create(idemRef, { key, command: "payment_webhook", result: resultValue, createdAt: serverTime(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) });
      return resultValue;
    });

    response.status(200).json(result);
  } catch (error) {
    console.error("paymentWebhook", error);
    response.status(400).json({ error: "payment_not_processed" });
  }
});

export const retentionSweep = onSchedule({ region: REGION, schedule: "every 24 hours", timeZone: "Africa/Johannesburg" }, async () => {
  // TTL handles ephemeral driver locations, delivery credentials, rate-limit buckets
  // and idempotency records. This schedule remains the policy review hook for
  // support/audit domains that must not be blindly deleted.
  console.log(JSON.stringify({ event: "retention_sweep", now: Date.now() }));
});

export const updateDriverLocation = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  await enforceRateLimit(db, { scope: `driver-location-${auth.uid}`, limit: 120, windowSeconds: 60 });
  const driverDoc = await driverForAuth(auth.uid);
  const latitude = Number(request.data?.latitude);
  const longitude = Number(request.data?.longitude);
  if (!validCoordinate(latitude, longitude)) throw new HttpsError("invalid-argument", "Valid coordinates are required.");
  const now = Date.now();
  await db.doc(`driverLocations/${driverDoc.id}`).set({
    driverId: driverDoc.id, latitude, longitude, geohash: encodeGeohash(latitude, longitude), region: text(request.data?.region || "gauteng"),
    accuracyMeters: Number(request.data?.accuracyMeters || 0), recordedAt: serverTime(), expiresAt: new Date(now + 30 * 60_000),
    activeTaskId: driverDoc.data().activeTaskId || null
  }, { merge: true });
  return { driverId: driverDoc.id, accepted: true };
});

export const advanceDelivery = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const controls = await platformControls();
  if (!controls.deliveryEnabled || controls.maintenanceMode) throw new HttpsError("failed-precondition", "Delivery operations are paused.");
  const driverDoc = await driverForAuth(auth.uid);
  const taskId = driverDoc.data().activeTaskId;
  if (!taskId) throw new HttpsError("failed-precondition", "No active delivery.");
  const taskRef = db.doc(`deliveryTasks/${taskId}`);
  const progression = { assigned: "driver_to_pickup", driver_to_pickup: "at_pickup", at_pickup: "picked_up", picked_up: "en_route", en_route: "arriving" };

  return db.runTransaction(async tx => {
    const taskSnap = await tx.get(taskRef);
    if (!taskSnap.exists) throw new HttpsError("not-found", "Delivery not found.");
    const task = taskSnap.data();
    if (task.assignedDriverId !== driverDoc.id) throw new HttpsError("permission-denied", "Delivery belongs to another driver.");
    const next = progression[task.status];
    if (!next) throw new HttpsError("failed-precondition", "Delivery requires PIN completion or dispatch action.");
    tx.update(taskRef, { status: next, version: FieldValue.increment(1), ...(next === "picked_up" ? { pickedUpAt: serverTime() } : {}) });
    tx.create(db.collection("deliveryEvents").doc(), { taskId, type: next, message: `Delivery moved to ${next}`, actorType: "driver", actorId: driverDoc.id, createdAt: serverTime() });
    if (next === "picked_up") {
      tx.update(db.doc(`orders/${task.orderId}`), { status: "out_for_delivery", version: FieldValue.increment(1), updatedAt: serverTime() });
      tx.create(db.collection("orderEvents").doc(), { orderId: task.orderId, type: "order_status_changed", status: "out_for_delivery", actorType: "driver", actorId: driverDoc.id, createdAt: serverTime() });
    }
    return { taskId, status: next };
  });
});

export const confirmDelivery = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const driverDoc = await driverForAuth(auth.uid);
  const taskId = driverDoc.data().activeTaskId;
  const submitted = text(request.data?.pin);
  if (!taskId || !submitted) throw new HttpsError("invalid-argument", "Active delivery and PIN are required.");
  const taskRef = db.doc(`deliveryTasks/${taskId}`);

  return db.runTransaction(async tx => {
    const [taskSnap, driverSnap] = await Promise.all([tx.get(taskRef), tx.get(driverDoc.ref)]);
    const task = taskSnap.data();
    if (!task || task.assignedDriverId !== driverDoc.id || task.status !== "arriving") throw new HttpsError("failed-precondition", "Delivery is not ready for completion.");
    const expectedHash = text(task.verification?.credentialHash);
    const submittedHash = createHash("sha256").update(submitted).digest("hex");
    if (!expectedHash || submittedHash !== expectedHash) throw new HttpsError("permission-denied", "Delivery PIN is incorrect.");

    tx.update(taskRef, { status: "delivered", deliveredAt: serverTime(), version: FieldValue.increment(1), "verification.credentialHash": FieldValue.delete() });
    tx.update(db.doc(`orders/${task.orderId}`), { status: "completed", version: FieldValue.increment(1), updatedAt: serverTime() });
    tx.update(driverDoc.ref, { availability: "available", activeTaskId: null, completedDeliveries: FieldValue.increment(1), version: FieldValue.increment(1) });
    if (task.assignmentId) tx.update(db.doc(`deliveryAssignments/${task.assignmentId}`), { status: "completed", completedAt: serverTime(), version: FieldValue.increment(1) });
    tx.delete(db.doc(`deliveryCredentials/${taskId}`));
    tx.create(db.collection("proofsOfDelivery").doc(), { taskId, orderId: task.orderId, driverId: driverDoc.id, method: "customer_pin", confirmedAt: serverTime() });
    tx.create(db.collection("deliveryEvents").doc(), { taskId, type: "delivered", message: "Delivery completed with customer PIN", actorType: "driver", actorId: driverDoc.id, createdAt: serverTime() });
    tx.create(db.collection("orderEvents").doc(), { orderId: task.orderId, type: "order_status_changed", status: "completed", actorType: "driver", actorId: driverDoc.id, createdAt: serverTime() });
    return { taskId, status: "delivered" };
  });
});

export const setMerchantCompliance = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { merchantId, status, note = "", reason = "" } = request.data || {};
  const allowed = ["pending_review", "compliant", "needs_action", "suspended"];
  if (!merchantId || !allowed.includes(status) || !text(reason || note)) throw new HttpsError("invalid-argument", "Merchant, valid compliance status and reason are required.");
  const ref = db.doc(`merchants/${merchantId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Merchant not found.");
    const before = snap.data().compliance || null;
    const after = { status, note: text(note), updatedAt: serverTime() };
    tx.update(ref, { compliance: after, version: FieldValue.increment(1), updatedAt: serverTime() });
    tx.create(db.collection("merchantComplianceEvents").doc(), { merchantId, before, after: { status, note: text(note) }, actorUid: auth.uid, reason: text(reason || note), createdAt: serverTime() });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "merchant_compliance_changed", targetType: "merchant", targetId: merchantId, reason: text(reason || note), visibility: "operations", metadata: { status }, timestamp: serverTime() }));
  });
  return { merchantId, status };
});

export const setMerchantCommercial = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { merchantId, plan = "Standard", status = "active", note = "", reason = "" } = request.data || {};
  const allowedStatuses = ["active", "review", "overdue", "suspended"];
  if (!merchantId || !allowedStatuses.includes(status) || !text(reason)) throw new HttpsError("invalid-argument", "Merchant, valid commercial status and reason are required.");
  const ref = db.doc(`merchants/${merchantId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Merchant not found.");
    const before = snap.data().commercial || null;
    const after = { plan: text(plan || "Standard"), status, note: text(note), updatedAt: serverTime() };
    tx.update(ref, { commercial: after, version: FieldValue.increment(1), updatedAt: serverTime() });
    tx.create(db.collection("commercialStatusEvents").doc(), { merchantId, before, after: { plan: after.plan, status, note: after.note }, actorUid: auth.uid, reason: text(reason), createdAt: serverTime() });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "merchant_commercial_status_changed", targetType: "merchant", targetId: merchantId, reason: text(reason), visibility: "operations", metadata: { status, plan: after.plan }, timestamp: serverTime() }));
  });
  return { merchantId, status, plan: text(plan || "Standard") };
});

export const setMerchantQualityWorkflow = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { merchantId, status, note = "", reason = "" } = request.data || {};
  const allowed = ["healthy", "watch", "intervention", "probation", "suspended"];
  if (!merchantId || !allowed.includes(status) || !text(reason || note)) throw new HttpsError("invalid-argument", "Merchant, valid quality status and reason are required.");
  const ref = db.doc(`merchants/${merchantId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Merchant not found.");
    const before = snap.data().qualityWorkflow || null;
    const after = { status, note: text(note), updatedAt: serverTime() };
    tx.update(ref, { qualityWorkflow: after, version: FieldValue.increment(1), updatedAt: serverTime() });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "merchant_quality_workflow_changed", targetType: "merchant", targetId: merchantId, reason: text(reason || note), visibility: "operations", metadata: { before, after: { status, note: after.note } }, timestamp: serverTime() }));
  });
  return { merchantId, status };
});

export const updateSupportCase = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { caseId, status, assignedTo = null, note = "" } = request.data || {};
  const allowed = ["open", "in_progress", "waiting", "resolved"];
  if (!caseId || (status && !allowed.includes(status))) throw new HttpsError("invalid-argument", "Valid support case update is required.");
  const ref = db.doc(`supportCases/${caseId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Support case not found.");
    const before = snap.data();
    const afterStatus = status || before.status;
    tx.update(ref, { status: afterStatus, assignedTo, resolutionNote: text(note), updatedAt: serverTime(), version: FieldValue.increment(1) });
    tx.create(db.collection("supportCaseEvents").doc(), { caseId, type: "case_updated", actorUid: auth.uid, actorRole: auth.token?.goodkotaOwner ? "owner" : "admin", note: text(note), metadata: { beforeStatus: before.status, afterStatus }, createdAt: serverTime() });
  });
  return { caseId, status: status || null };
});

export const submitVerifiedRating = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const { orderId, overall, food, service, comment = "" } = request.data || {};
  const values = [overall, food, service].map(Number);
  if (!orderId || values.some(value => !Number.isInteger(value) || value < 1 || value > 5)) throw new HttpsError("invalid-argument", "Ratings must be whole numbers from 1 to 5.");
  await enforceRateLimit(db, { scope: `rating-${auth.uid}`, limit: 10, windowSeconds: 60 });
  const orderRef = db.doc(`orders/${orderId}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const order = snap.data();
    if (order.customerId !== auth.uid || order.status !== "completed" || order.rated === true) throw new HttpsError("failed-precondition", "Order cannot be rated.");
    const ratingRef = db.collection("ratings").doc();
    tx.create(ratingRef, { merchantId: order.merchantId, orderId, customerId: auth.uid, verified: true, overall: values[0], food: values[1], service: values[2], comment: text(comment).slice(0, 2000), createdAt: serverTime() });
    tx.update(orderRef, { rated: true, version: FieldValue.increment(1), updatedAt: serverTime() });
    return { ratingId: ratingRef.id };
  });
});

export const recordRefund = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { paymentId, amountCents, reason, idempotencyKey } = request.data || {};
  if (!paymentId || !text(reason) || !idempotencyKey) throw new HttpsError("invalid-argument", "paymentId, amount, reason and idempotencyKey are required.");
  const amount = cents(amountCents);
  if (amount <= 0) throw new HttpsError("invalid-argument", "Refund amount must be greater than zero.");
  const idemRef = db.doc(`idempotencyRecords/refund_${String(idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, "_")}`);

  return db.runTransaction(async tx => {
    const idem = await tx.get(idemRef);
    if (idem.exists) return idem.data().result;
    const paymentRef = db.doc(`paymentTransactions/${paymentId}`);
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment not found.");
    const refunds = await tx.get(db.collection("refunds").where("paymentId", "==", paymentId));
    const alreadyCommitted = refunds.docs
      .map(doc => doc.data())
      .filter(refund => !["failed", "cancelled"].includes(refund.status))
      .reduce((sum, refund) => sum + Number(refund.amountCents || 0), 0);
    const payment = paymentSnap.data();
    if (alreadyCommitted + amount > Number(payment.amountCents || 0)) throw new HttpsError("invalid-argument", "Refunds would exceed the captured payment amount.");

    const refundRef = db.collection("refunds").doc();
    tx.create(refundRef, { paymentId, orderId: payment.orderId, merchantId: payment.merchantId, amountCents: amount, reason: text(reason), status: "requested", actorUid: auth.uid, createdAt: serverTime() });
    tx.create(db.collection("paymentEvents").doc(), { paymentId, orderId: payment.orderId, type: "refund_requested", amountCents: -amount, refundId: refundRef.id, actorUid: auth.uid, createdAt: serverTime() });
    const result = { refundId: refundRef.id, status: "requested" };
    tx.create(idemRef, { key: idempotencyKey, command: "refund", result, createdAt: serverTime(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) });
    return result;
  });
});



// -----------------------------------------------------------------------------
// v6.1 integrated product roll-up commands
// Public intake is write-only through App Check protected Cloud Functions.
// Merchant catalogue writes are tenant-scoped. Company operations remain Admin
// scoped, while brand authority remains Owner-only.
// -----------------------------------------------------------------------------

function publicScope(kind, value) {
  return `${kind}-${createHash("sha256").update(text(value).toLowerCase() || "anonymous").digest("hex").slice(0, 20)}`;
}

function validHttpUrl(value) {
  const raw = text(value);
  if (!raw) return true;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const submitMerchantApplication = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const data = request.data || {};
  const businessName = text(data.businessName).slice(0, 160);
  const contactName = text(data.contactName).slice(0, 160);
  const email = text(data.email).toLowerCase().slice(0, 320);
  const phone = text(data.phone).slice(0, 80);
  const address = text(data.address).slice(0, 500);
  if (!businessName || !contactName || !email || !phone || !address) {
    throw new HttpsError("invalid-argument", "Business, contact and physical address details are required.");
  }
  await enforceRateLimit(db, { scope: publicScope("merchant-application", email || phone), limit: 4, windowSeconds: 60 });
  const latitude = data.latitude == null || data.latitude === "" ? null : Number(data.latitude);
  const longitude = data.longitude == null || data.longitude === "" ? null : Number(data.longitude);
  if ((latitude != null || longitude != null) && !validCoordinate(latitude, longitude)) {
    throw new HttpsError("invalid-argument", "Application coordinates are invalid.");
  }
  const ref = db.collection("merchantApplications").doc();
  await ref.create({
    businessName, contactName, email, phone, address, area: text(data.area).slice(0, 160),
    latitude, longitude, geohash: latitude != null ? encodeGeohash(latitude, longitude) : null,
    note: text(data.note).slice(0, 2000), status: "new", createdAt: serverTime(), updatedAt: serverTime(), version: 1
  });
  return { applicationId: ref.id, status: "new" };
});

export const submitDriverApplication = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const data = request.data || {};
  const name = text(data.name).slice(0, 160);
  const email = text(data.email).toLowerCase().slice(0, 320);
  const phone = text(data.phone).slice(0, 80);
  const vehicleType = text(data.vehicleType).slice(0, 120);
  const operatingArea = text(data.operatingArea).slice(0, 200);
  if (!name || !email || !phone || !vehicleType || !operatingArea) {
    throw new HttpsError("invalid-argument", "Driver contact, vehicle and operating area are required.");
  }
  await enforceRateLimit(db, { scope: publicScope("driver-application", email || phone), limit: 4, windowSeconds: 60 });
  const ref = db.collection("driverApplications").doc();
  await ref.create({
    name, email, phone, vehicleType, registration: text(data.registration).slice(0, 80), operatingArea,
    note: text(data.note).slice(0, 2000), status: "new", createdAt: serverTime(), updatedAt: serverTime(), version: 1
  });
  return { applicationId: ref.id, status: "new" };
});

export const joinPublicWaitlist = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const data = request.data || {};
  const email = text(data.email).toLowerCase().slice(0, 320);
  if (!email) throw new HttpsError("invalid-argument", "Email is required.");
  await enforceRateLimit(db, { scope: publicScope("waitlist", email), limit: 4, windowSeconds: 60 });
  const digest = createHash("sha256").update(email).digest("hex").slice(0, 40);
  const ref = db.doc(`waitlistEntries/${digest}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const values = { name: text(data.name).slice(0, 160), email, area: text(data.area).slice(0, 160), updatedAt: serverTime() };
    if (snap.exists) tx.set(ref, values, { merge: true });
    else tx.create(ref, { ...values, createdAt: serverTime() });
  });
  return { waitlistId: ref.id };
});

export const updateMerchantCatalogueItem = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireAuth(request);
  const data = request.data || {};
  const merchantId = text(data.merchantId);
  const productId = text(data.productId);
  if (!merchantId || !(await merchantMembership(auth.uid, merchantId))) {
    throw new HttpsError("permission-denied", "Active merchant membership is required.");
  }
  const name = data.name === undefined ? undefined : text(data.name).slice(0, 160);
  const priceCents = data.priceCents === undefined ? undefined : cents(data.priceCents);
  const category = data.category === undefined ? undefined : text(data.category).slice(0, 120);
  const desc = data.desc === undefined ? undefined : text(data.desc).slice(0, 2000);
  const emoji = data.emoji === undefined ? undefined : text(data.emoji).slice(0, 16);
  const imageUrl = data.imageUrl === undefined ? undefined : text(data.imageUrl).slice(0, 2000);
  if (imageUrl !== undefined && !validHttpUrl(imageUrl)) throw new HttpsError("invalid-argument", "Menu image URL must use http or https.");

  if (!productId) {
    if (!name || !priceCents) throw new HttpsError("invalid-argument", "Menu item name and positive price are required.");
    const ref = db.collection("products").doc();
    await ref.create({ merchantId, name, priceCents, category: category || "Kotas", desc: desc || "", emoji: emoji || "🥪", imageUrl: imageUrl || "", enabled: data.enabled !== false, createdAt: serverTime(), updatedAt: serverTime(), version: 1 });
    return { productId: ref.id, created: true };
  }

  const ref = db.doc(`products/${productId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().merchantId !== merchantId) throw new HttpsError("not-found", "Menu item was not found in this merchant account.");
    const changes = {};
    if (name !== undefined) changes.name = name;
    if (priceCents !== undefined) changes.priceCents = priceCents;
    if (category !== undefined) changes.category = category;
    if (desc !== undefined) changes.desc = desc;
    if (emoji !== undefined) changes.emoji = emoji;
    if (imageUrl !== undefined) changes.imageUrl = imageUrl;
    if (data.enabled !== undefined) changes.enabled = Boolean(data.enabled);
    if (changes.name === "" || changes.priceCents === 0) throw new HttpsError("invalid-argument", "Menu item name and positive price are required.");
    tx.update(ref, { ...changes, updatedAt: serverTime(), version: FieldValue.increment(1) });
  });
  return { productId, created: false };
});

export const adminManagePromotion = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const data = request.data || {};
  const promoId = text(data.promoId);
  const requestedCode = data.code === undefined ? undefined : text(data.code).toUpperCase().slice(0, 80);
  const ref = promoId ? db.doc(`promos/${promoId}`) : db.collection("promos").doc();

  await db.runTransaction(async tx => {
    const beforeSnap = promoId ? await tx.get(ref) : null;
    if (promoId && !beforeSnap.exists) throw new HttpsError("not-found", "Promotion not found.");
    const before = beforeSnap?.data() || null;
    const code = requestedCode ?? before?.code ?? "";
    const discountPercent = data.discountPercent === undefined
      ? Number(before?.discountPercent || 0)
      : Math.max(0, Math.min(100, Number(data.discountPercent || 0)));
    const minCents = data.minCents === undefined ? Number(before?.minCents || 0) : cents(data.minCents || 0);
    const status = data.status === undefined ? (before?.status || "active") : (["active", "disabled"].includes(data.status) ? data.status : "active");
    if (!code || discountPercent <= 0) throw new HttpsError("invalid-argument", "Promotion code and discount are required.");

    const duplicateSnap = await tx.get(db.collection("promos").where("code", "==", code).limit(2));
    if (duplicateSnap.docs.some(doc => doc.id !== ref.id)) throw new HttpsError("already-exists", "Promotion code already exists.");

    const next = promoId
      ? { code, discountPercent, minCents, status, updatedAt: serverTime(), version: FieldValue.increment(1) }
      : { code, discountPercent, minCents, status, createdAt: serverTime(), updatedAt: serverTime(), version: 1 };
    if (promoId) tx.update(ref, next); else tx.create(ref, next);
    tx.create(db.collection("promotionEvents").doc(), { promoId: ref.id, type: promoId ? "updated" : "created", actorUid: auth.uid, metadata: { before: before ? { code: before.code, status: before.status, discountPercent: before.discountPercent, minCents: before.minCents } : null, after: { code, status, discountPercent, minCents } }, createdAt: serverTime() });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: promoId ? "promotion_updated" : "promotion_created", targetType: "promotion", targetId: ref.id, reason: code, visibility: "operations", timestamp: serverTime() }));
  });
  return { promoId: ref.id };
});

export const adminManageDriver = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const data = request.data || {};
  const driverId = text(data.driverId);
  const reason = text(data.reason || (driverId ? "Driver administration" : "Driver onboarding"));
  if (!reason) throw new HttpsError("invalid-argument", "Reason is required.");

  if (!driverId) {
    const name = text(data.name).slice(0, 160);
    const phone = text(data.phone).slice(0, 80);
    if (!name || !phone) throw new HttpsError("invalid-argument", "Driver name and phone are required.");
    const vehicleRef = db.collection("driverVehicles").doc();
    const driverRef = db.collection("drivers").doc();
    const batch = db.batch();
    batch.create(vehicleRef, { driverId: driverRef.id, type: text(data.vehicleType || "Vehicle").slice(0, 120), registration: text(data.registration).slice(0, 80), ownerType: text(data.operatorType || "goodkota"), ownerId: text(data.operatorId || "goodkota"), createdAt: serverTime(), version: 1 });
    batch.create(driverRef, { name, phone, email: text(data.email).toLowerCase().slice(0, 320), authUid: data.authUid || null, operatorType: text(data.operatorType || "goodkota"), operatorId: text(data.operatorId || "goodkota"), enabled: true, shiftStatus: "offline", availability: "available", vehicleId: vehicleRef.id, activeTaskId: null, rating: 0, completedDeliveries: 0, trackingConsent: true, createdAt: serverTime(), updatedAt: serverTime(), version: 1 });
    batch.create(db.collection("driverAdministrationEvents").doc(), { driverId: driverRef.id, type: "driver_added", actorUid: auth.uid, reason, createdAt: serverTime() });
    batch.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "driver_added", targetType: "driver", targetId: driverRef.id, reason, visibility: "operations", timestamp: serverTime() }));
    await batch.commit();
    return { driverId: driverRef.id };
  }

  const driverRef = db.doc(`drivers/${driverId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(driverRef);
    if (!snap.exists) throw new HttpsError("not-found", "Driver not found.");
    const before = snap.data();
    let vehicleRef = null;
    let vehicleSnap = null;
    if ((data.vehicleType !== undefined || data.registration !== undefined) && before.vehicleId) {
      vehicleRef = db.doc(`driverVehicles/${before.vehicleId}`);
      vehicleSnap = await tx.get(vehicleRef);
    }
    const changes = {};
    for (const key of ["name", "phone", "email", "operatorType", "operatorId", "authUid"]) if (data[key] !== undefined) changes[key] = text(data[key]);
    if (data.enabled !== undefined) changes.enabled = Boolean(data.enabled);
    tx.update(driverRef, { ...changes, updatedAt: serverTime(), version: FieldValue.increment(1) });
    if (vehicleRef && vehicleSnap?.exists) {
      tx.update(vehicleRef, { ...(data.vehicleType !== undefined ? { type: text(data.vehicleType).slice(0, 120) } : {}), ...(data.registration !== undefined ? { registration: text(data.registration).slice(0, 80) } : {}), version: FieldValue.increment(1), updatedAt: serverTime() });
    }
    tx.create(db.collection("driverAdministrationEvents").doc(), { driverId, type: "driver_updated", actorUid: auth.uid, reason, metadata: { before: { enabled: before.enabled, operatorType: before.operatorType, operatorId: before.operatorId } }, createdAt: serverTime() });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "driver_updated", targetType: "driver", targetId: driverId, reason, visibility: "operations", timestamp: serverTime() }));
  });
  return { driverId };
});

export const adminUpdateApplication = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "admin");
  const { kind, applicationId, status = "review", note = "" } = request.data || {};
  if (!['merchant', 'driver'].includes(kind) || !applicationId || !['new', 'review', 'approved', 'declined'].includes(status)) {
    throw new HttpsError("invalid-argument", "Valid application kind, id and status are required.");
  }
  const collection = kind === "merchant" ? "merchantApplications" : "driverApplications";
  const ref = db.doc(`${collection}/${applicationId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Application not found.");
    tx.update(ref, { status, adminNote: text(note).slice(0, 2000), reviewedByUid: auth.uid, updatedAt: serverTime(), version: FieldValue.increment(1) });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: `${kind}_application_updated`, targetType: `${kind}_application`, targetId: applicationId, reason: text(note || status), visibility: "operations", metadata: { status }, timestamp: serverTime() }));
  });
  return { applicationId, status };
});

export const ownerUpdateBrandSettings = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const auth = requireRole(request, "owner");
  const data = request.data || {};
  const reason = text(data.reason);
  if (!reason) throw new HttpsError("invalid-argument", "Owner reason is required.");
  const publicWebsite = text(data.publicWebsite || "./website.html");
  const social = {
    instagram: text(data.social?.instagram),
    facebook: text(data.social?.facebook),
    tiktok: text(data.social?.tiktok)
  };
  if (![publicWebsite, ...Object.values(social)].every(validHttpUrl)) {
    // Relative in-app public website is deliberately supported.
    if (!(publicWebsite.startsWith("./") && Object.values(social).every(validHttpUrl))) {
      throw new HttpsError("invalid-argument", "Brand links must use http/https, except the in-app public website path.");
    }
  }
  const ref = db.doc(PLATFORM_CONFIG);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const before = snap.data()?.brand || null;
    const brand = { publicWebsite, social };
    tx.set(ref, { brand, updatedAt: serverTime() }, { merge: true });
    tx.set(db.doc("publicBrand/current"), { ...brand, updatedAt: serverTime() }, { merge: true });
    tx.create(db.collection("platformAudit").doc(), auditEvent({ actor: auth, action: "brand_settings_updated", targetType: "platform_brand", targetId: "goodkota", reason, visibility: "owner", metadata: { before, after: brand }, timestamp: serverTime() }));
  });
  return { publicWebsite, social };
});

export const rollupPaidOrder = onDocumentCreated({ region: REGION, document: "orders/{orderId}" }, async event => {
  const order = event.data?.data();
  if (order?.paymentStatus === "paid") await incrementMetric(db, "paid_orders", event.params.orderId, 1);
});

export const rollupVerifiedRating = onDocumentCreated({ region: REGION, document: "ratings/{ratingId}" }, async event => {
  const rating = event.data?.data();
  if (!rating?.verified || !rating.merchantId) return;
  const ref = db.doc(`merchantQualityAggregates/${rating.merchantId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.data() || { count: 0, overallSum: 0, foodSum: 0, serviceSum: 0 };
    const count = Number(current.count || 0) + 1;
    const next = {
      count,
      overallSum: Number(current.overallSum || 0) + Number(rating.overall || 0),
      foodSum: Number(current.foodSum || 0) + Number(rating.food || 0),
      serviceSum: Number(current.serviceSum || 0) + Number(rating.service || 0),
      updatedAt: serverTime()
    };
    const summary = {
      count,
      overall: next.overallSum / count,
      food: next.foodSum / count,
      service: next.serviceSum / count,
      updatedAt: serverTime()
    };
    tx.set(ref, next, { merge: true });
    tx.set(db.doc(`merchants/${rating.merchantId}`), { qualitySummary: summary, updatedAt: serverTime() }, { merge: true });
  });
});
