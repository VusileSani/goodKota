import { requireRole } from "./authorization-service.js";
import { uid } from "../core/utils.js";

export class GoodKotaCommandService {
  constructor({ store, paymentService, telemetry }) {
    this.store = store;
    this.paymentService = paymentService;
    this.telemetry = telemetry;
    this.rateWindow = new Map();
  }

  assertRateLimit(scope, limit = 20, windowMs = 60_000) {
    const now = Date.now();
    const entries = (this.rateWindow.get(scope) || []).filter(time => now - time < windowMs);
    if (entries.length >= limit) throw new Error("Too many requests. Please try again shortly.");
    entries.push(now);
    this.rateWindow.set(scope, entries);
  }

  idempotent(key, command, fn) {
    if (!key) return fn();
    const existing = this.store.findIdempotency(key);
    if (existing) return existing.result;
    const result = fn();
    this.store.rememberIdempotency(key, command, result);
    return result;
  }

  async checkout({ merchantId, customerId, customerDetails, mode, address, notes, amountCents, deliveryFeeCents, fulfilment, items, idempotencyKey }) {
    this.assertRateLimit(`checkout:${customerId}`, 10, 60_000);
    const controls = this.store.state.platform.controls || {};
    if (!controls.orderingEnabled) throw new Error("GoodKota ordering is temporarily paused.");
    if (!controls.paymentsEnabled) throw new Error("GoodKota payments are temporarily unavailable.");
    if (fulfilment?.type === "delivery" && !controls.deliveryEnabled) throw new Error("GoodKota delivery is temporarily unavailable.");

    const prior = this.store.findIdempotency(idempotencyKey);
    if (prior) return prior.result;

    const merchant = this.store.merchant(merchantId);
    if (!merchant || !merchant.enabled || merchant.commercial?.status === "suspended" || merchant.compliance?.status === "suspended") throw new Error("This merchant is not currently available.");
    if (Number(amountCents) < Number(merchant.minOrderCents || 0)) throw new Error("The order is below the merchant minimum.");

    const orderId = uid("order");
    const orderNumber = this.store.generateOrderNumber();
    const intent = await this.paymentService.createPaymentIntent({
      amountCents, orderId, merchant, customer: customerDetails,
      breakdown: { foodAmountCents: amountCents - deliveryFeeCents, deliveryAmountCents: deliveryFeeCents },
      fulfilment, idempotencyKey
    });
    const verified = await this.paymentService.simulateVerifiedWebhook(intent);
    if (!verified.signatureVerified || verified.status !== "paid") throw new Error("Payment could not be verified.");

    const result = this.store.transaction(() => {
      const payment = this.store.appendPaymentTransaction({ ...verified, version: 1 });
      this.store.appendPaymentEvent({ paymentId: payment.paymentId, orderId, type: "payment_captured", providerStatus: payment.providerStatus, amountCents: payment.amountCents, idempotencyKey, signatureVerified: true });
      this.store.state.feeAllocations.push({ id: uid("fee"), orderId, paymentId: payment.paymentId, merchantId, foodAmountCents: amountCents - deliveryFeeCents, deliveryAmountCents: deliveryFeeCents, createdAt: Date.now() });
      const order = this.store.createPaidOrder({
        id: orderId, orderNumber, customerId, merchantId, customer: customerDetails.name, phone: customerDetails.phone, email: customerDetails.email,
        mode, address, notes, amountCents, deliveryFeeCents, fulfilment, paymentId: payment.paymentId, items, idempotencyKey
      });
      this.store.enqueueJob({ type: "order_notifications", payload: { orderId: order.id, merchantId }, idempotencyKey: `notify:${order.id}:created` });
      const response = { orderId: order.id, orderNumber: order.orderNumber, paymentId: payment.paymentId };
      this.store.rememberIdempotency(idempotencyKey, "checkout", response);
      return response;
    });

    this.telemetry.emit({ domain: "checkout", event: "checkout_completed", actorId: customerId, merchantId, metadata: { orderId: result.orderId } });
    return result;
  }

  merchantOrderTransition({ orderId, status, merchantId }) {
    return this.store.transaction(() => {
      const order = this.store.order(orderId);
      if (!order || order.merchantId !== merchantId) throw new Error("Order is outside this merchant scope.");
      const result = this.store.updateOrderStatus(orderId, status, { role: "merchant", id: merchantId });
      this.store.enqueueJob({ type: "order_status_notification", payload: { orderId, status }, idempotencyKey: `notify:${orderId}:${status}:${result.version}` });
      return result;
    });
  }

  assignDriver({ taskId, driverId, actorId = "dispatch" }) {
    requireRole({ role: "delivery" }, "delivery");
    return this.store.transaction(() => {
      const assignment = this.store.assignDriver(taskId, driverId, actorId);
      this.store.enqueueJob({ type: "driver_assignment_notification", payload: { taskId, driverId }, idempotencyKey: `notify:${assignment.id}` });
      return assignment;
    });
  }

  advanceDriver({ driverId }) { return this.store.transaction(() => this.store.advanceDriverTask(driverId)); }
  confirmDelivery({ driverId, pin }) { return this.store.transaction(() => this.store.confirmDelivery(driverId, pin)); }
  updateDriverLocation(args) { return this.store.transaction(() => this.store.updateDriverLocation(args.driverId, args.latitude, args.longitude, args.accuracyMeters)); }
  setDriverShift({ driverId, shiftStatus }) { return this.store.transaction(() => this.store.setDriverShift(driverId, shiftStatus)); }
  submitRating(data) { return this.store.transaction(() => this.store.addRating(data)); }
  setNearbyNotifications(enabled) { return this.store.transaction(() => this.store.setNearbyNotifications(enabled)); }
  addProduct(product) { return this.store.transaction(() => this.store.addProduct(product)); }
  saveSettlement(merchantId, settlement, gatewayAccount, actor, reason) { return this.store.transaction(() => this.store.saveMerchantSettlement(merchantId, settlement, gatewayAccount, actor, reason)); }
  createSupportCase(data, actor = null) { this.assertRateLimit(`support:${data.source}:${data.sourceId || data.merchantId || "anon"}`, 8, 60_000); return this.store.transaction(() => this.store.addSupportCase(data, actor)); }

  adminAddMerchant(merchant, actor) { requireRole(actor, ["admin", "owner"]); if (!this.store.state.platform.controls.merchantOnboardingEnabled) throw new Error("Merchant onboarding is paused by the GoodKota Owner."); return this.store.transaction(() => { const item = this.store.addMerchant(merchant); this.store.logAudit({ actor, action: "merchant_added", targetType: "merchant", targetId: item.id, reason: "Merchant onboarding", visibility: "operations" }); return item; }); }
  adminUpdateMerchant(merchantId, changes, actor, reason = "Merchant profile maintenance") { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => { const item = this.store.updateMerchant(merchantId, changes); this.store.logAudit({ actor, action: "merchant_details_updated", targetType: "merchant", targetId: merchantId, reason, visibility: "operations" }); return item; }); }
  adminSetMerchantEnabled(merchantId, enabled, actor, reason = "Merchant availability changed") { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => { const item = this.store.setMerchantEnabled(merchantId, enabled); this.store.logAudit({ actor, action: "merchant_enabled_changed", targetType: "merchant", targetId: merchantId, reason, visibility: "operations", metadata: { enabled } }); return item; }); }
  adminSetCompliance(merchantId, status, note, actor, reason = "Compliance review") { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => { const item = this.store.setMerchantCompliance(merchantId, status, note, actor, reason); this.store.logAudit({ actor, action: "merchant_compliance_changed", targetType: "merchant", targetId: merchantId, reason, visibility: "operations", metadata: { status } }); return item; }); }
  adminSetQuality(merchantId, status, note, actor) { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => { const item = this.store.setQualityWorkflow(merchantId, status, note); this.store.logAudit({ actor, action: "merchant_quality_workflow_changed", targetType: "merchant", targetId: merchantId, reason: note || status, visibility: "operations" }); return item; }); }
  adminSetCommercial(merchantId, commercial, actor, reason = "Commercial status maintenance") { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => this.store.setMerchantCommercial(merchantId, commercial, actor, reason)); }
  updateSupportCase(caseId, changes, actor) { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => this.store.updateSupportCase(caseId, changes, actor)); }
  publishAnnouncement(data, actor) { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => this.store.publishAnnouncement(data, actor)); }
  setAnnouncementActive(id, active, actor) { requireRole(actor, ["admin", "owner"]); return this.store.transaction(() => this.store.setAnnouncementActive(id, active, actor)); }
  updatePlatformControl(key, value, actor, reason) { requireRole(actor, "owner"); if (!String(reason || "").trim()) throw new Error("Owner reason is required."); return this.store.transaction(() => this.store.updatePlatformControl(key, value, actor, reason)); }
  addPlatformStaff(data, actor, reason) { requireRole(actor, "owner"); return this.store.transaction(() => this.store.addPlatformStaff(data, actor, reason)); }
  updatePlatformStaff(id, changes, actor, reason) { requireRole(actor, "owner"); return this.store.transaction(() => this.store.updatePlatformStaff(id, changes, actor, reason)); }
}
