import { uid } from "../core/utils.js";

function positiveCents(value, label) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(`${label} must be a positive integer number of cents.`);
  return cents;
}

export class FinancialLedgerService {
  constructor(store) {
    this.store = store;
  }

  recordRefund({ paymentId, orderId, merchantId, amountCents, reason, actor }) {
    const amount = positiveCents(amountCents, "Refund amount");
    return this.store.transaction(() => {
      const payment = this.store.state.paymentTransactions.find(item => item.paymentId === paymentId || item.id === paymentId);
      if (!payment) throw new Error("Payment not found.");
      const committed = this.store.state.refunds
        .filter(item => item.paymentId === paymentId && !["failed", "cancelled"].includes(item.status))
        .reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      if (committed + amount > Number(payment.amountCents || 0)) throw new Error("Refunds would exceed the captured payment amount.");
      const refund = { id: uid("refund"), paymentId, orderId, merchantId, amountCents: amount, reason: String(reason || "").trim(), status: "recorded", actorId: actor?.id || "system", createdAt: Date.now() };
      if (!refund.reason) throw new Error("Refund reason is required.");
      this.store.state.refunds.unshift(refund);
      this.store.appendPaymentEvent({ paymentId, orderId, type: "refund_recorded", amountCents: -amount, refundId: refund.id, actorId: refund.actorId });
      return refund;
    });
  }

  recordPayout({ merchantId, amountCents, periodStart, periodEnd, providerReference, actor }) {
    const amount = positiveCents(amountCents, "Payout amount");
    return this.store.transaction(() => {
      const payout = { id: uid("payout"), merchantId, amountCents: amount, periodStart, periodEnd, providerReference, status: "recorded", actorId: actor?.id || "system", createdAt: Date.now() };
      this.store.state.merchantPayouts.unshift(payout);
      this.store.state.settlementEvents.unshift({ id: uid("settlement_event"), merchantId, type: "payout_recorded", payoutId: payout.id, amountCents: payout.amountCents, actorId: payout.actorId, createdAt: Date.now() });
      return payout;
    });
  }

  reconcile({ runId = uid("recon"), actorId = "system" } = {}) {
    return this.store.transaction(() => {
      const paid = this.store.state.paymentTransactions.filter(item => item.status === "paid").reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const refunded = this.store.state.refunds.filter(item => !["failed", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const run = { id: runId, actorId, paidCents: paid, refundedCents: refunded, netCapturedCents: paid - refunded, status: "completed", createdAt: Date.now() };
      this.store.state.reconciliationRuns.unshift(run);
      return run;
    });
  }
}
