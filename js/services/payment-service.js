import { uid } from "../core/utils.js";

export class DemoMarketplacePaymentService {
  constructor(config) {
    this.config = config;
  }

  async createPayment({ amount, orderId, merchant, customer, breakdown = {}, fulfilment = { type: "pickup" } }) {
    if (!this.config.enabled) {
      throw new Error("The GoodKota payment gateway is currently disabled.");
    }

    if (merchant.gatewayAccount?.status !== "verified") {
      throw new Error("This merchant has not completed payment settlement onboarding.");
    }

    await new Promise(resolve => setTimeout(resolve, 450));

    const foodAmount = Number(breakdown.foodAmount ?? amount);
    const deliveryAmount = Number(breakdown.deliveryAmount ?? 0);
    const deliveryProvider = fulfilment.provider || null;

    return {
      paymentId: uid("pay"),
      gatewayReference: `GK-DEMO-${Date.now()}`,
      orderId,
      amount,
      amountBreakdown: { foodAmount, deliveryAmount },
      status: "paid",
      settlementModel: "direct_merchant_food_plus_delivery_allocation",
      settlementPlan: {
        food: {
          beneficiaryType: "merchant",
          merchantGatewayAccountId: merchant.gatewayAccount.id,
          amount: foodAmount
        },
        delivery: deliveryAmount > 0 ? {
          beneficiaryType: deliveryProvider === "merchant_fleet" ? "merchant" : "delivery_operator",
          providerType: deliveryProvider,
          amount: deliveryAmount
        } : null
      },
      merchantGatewayAccountId: merchant.gatewayAccount.id,
      customerEmail: customer.email,
      confirmedAt: Date.now()
    };
  }
}

export function maskBankAccount(accountNumber) {
  const clean = String(accountNumber || "").replace(/\D/g, "");
  if (clean.length < 4) return "••••";
  return `•••• ${clean.slice(-4)}`;
}
