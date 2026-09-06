/**
 * Production adapter boundary. Wire the selected South African marketplace
 * payment provider here. This module intentionally fails closed until a real
 * signature verification implementation and secrets are configured.
 */
export async function verifyPaymentWebhook(_request) {
  throw new Error("Payment provider verification is not configured. Refusing to create a paid order.");
}
