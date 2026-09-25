// Browser-side order shape for this prototype. A PayFast checkout must create
// and price its order again on an authenticated server.
export function buildPickupOrder(details, merchant, cart) {
  if (!merchant || !cart.length) throw new Error("Choose a pickup spot and an item.");
  const firstName = String(details.firstName || "").trim();
  const lastName = String(details.lastName || "").trim();
  const phone = String(details.phone || "").trim();
  const email = String(details.email || "").trim();
  if (!firstName || !phone || !email) throw new Error("Add your name, mobile number and email.");
  const items = cart.map(line => ({
    productId: line.productId, qty: line.qty, name: line.name,
    unitPrice: line.unitPrice,
    choices: (line.choices || []).map(choice => ({...choice}))
  }));
  if (items.some(item => !Number.isInteger(item.qty) || item.qty < 1 || !Number.isInteger(item.unitPrice) || item.unitPrice < 0)) throw new Error("Review your cart before ordering.");
  const now = new Date();
  return {
    id: `GK-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
    merchantId: merchant.id,
    pickup: { name: merchant.name, address: merchant.address, area: merchant.area },
    fulfillment: "pickup", currency: "ZAR",
    customer: `${firstName} ${lastName}`.trim(),
    customerDetails: { firstName, lastName, phone, email },
    contact: { phone, email },
    paymentMethod: "pay_on_collection", paymentStatus: "unpaid",
    status: "new", items,
    total: items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    createdAt: now.toLocaleString("en-ZA", {dateStyle: "medium", timeStyle: "short"}),
    createdIso: now.toISOString()
  };
}
