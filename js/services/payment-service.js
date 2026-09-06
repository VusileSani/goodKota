import { uid } from "../core/utils.js";

export class LocalMarketplacePaymentAdapter {
  constructor(config) {
    this.config = config;
  }

  async createPaymentIntent({ amountCents, orderId, merchant, customer, breakdown = {}, fulfilment = { type: "pickup" }, idempotencyKey }) {
    if (!this.config.enabled) throw new Error("The GoodKota payment gateway is currently disabled.");
    if (merchant.gatewayAccount?.status !== "verified") throw new Error("This merchant has not completed payment settlement onboarding.");
    await new Promise(resolve => setTimeout(resolve, 350));

    const foodAmountCents = Number(breakdown.foodAmountCents ?? amountCents);
    const deliveryAmountCents = Number(breakdown.deliveryAmountCents ?? 0);
    const deliveryProvider = fulfilment.provider || null;

    return {
      paymentId: uid("pay"),
      gatewayReference: `GK-PAY-${uid("ref").slice(-12).toUpperCase()}`,
      orderId,
      idempotencyKey,
      amountCents: Number(amountCents),
      amountBreakdown: { foodAmountCents, deliveryAmountCents },
      providerStatus: "authorized",
      settlementModel: "direct_merchant_food_plus_delivery_allocation",
      settlementPlan: {
        food: { beneficiaryType: "merchant", merchantGatewayAccountId: merchant.gatewayAccount.id, amountCents: foodAmountCents },
        delivery: deliveryAmountCents > 0 ? {
          beneficiaryType: deliveryProvider === "merchant_fleet" ? "merchant" : "delivery_operator",
          providerType: deliveryProvider,
          amountCents: deliveryAmountCents
        } : null
      },
      merchantGatewayAccountId: merchant.gatewayAccount.id,
      customerEmail: customer.email,
      initiatedAt: Date.now()
    };
  }

  async simulateVerifiedWebhook(intent) {
    await new Promise(resolve => setTimeout(resolve, 120));
    return {
      ...intent,
      status: "paid",
      providerStatus: "captured",
      signatureVerified: true,
      confirmedAt: Date.now()
    };
  }
}

export function maskBankAccount(accountNumber) {
  const clean = String(accountNumber || "").replace(/\D/g, "");
  if (clean.length < 4) return "••••";
  return `•••• ${clean.slice(-4)}`;
}
