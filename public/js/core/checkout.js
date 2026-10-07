import { canOrder } from "./operations.js";
import { selectedChoices, sameChoice } from "./menu-choices.js";

// Shared order contract. The server uses its own menu and authenticated actor
// when creating an order; the browser preview is never authoritative.
export function buildPickupOrder(details, merchant, cart) {
  if (!merchant || !cart.length) throw new Error("Choose a pickup spot and an item.");
  if (!canOrder(merchant)) throw new Error("This spot is not taking orders right now.");
  const firstName = String(details.firstName || "").trim();
  const lastName = String(details.lastName || "").trim();
  const phone = String(details.phone || "").trim();
  const email = String(details.email || "").trim();
  if (!firstName || !phone || !email) throw new Error("Add your name, mobile number and email.");
  let total = 0;
  const items = cart.map(line => {
    const product = merchant.menu?.find(item => item.id === line.productId);
    if (!product?.available || !Number.isSafeInteger(product.price) || product.price <= 0 ||
        !Number.isSafeInteger(line.qty) || line.qty < 1 || !Array.isArray(line.choices || [])) {
      throw new Error("Menu changed. Review your cart before ordering.");
    }
    if ((line.choices || []).some(choice => !choice || typeof choice.id !== "string")) {
      throw new Error("Menu changed. Review your cart before ordering.");
    }
    const choices = selectedChoices(product, (line.choices || []).map(choice => choice.id));
    const unitPrice = product.price + choices.reduce((sum, choice) => sum + choice.price, 0);
    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0 || line.unitPrice !== unitPrice ||
        (line.name && line.name !== product.name) ||
        (line.choices || []).some((choice, index) => !sameChoice(choice, choices[index]))) {
      throw new Error("Menu changed. Review your cart before ordering.");
    }
    total += unitPrice * line.qty;
    if (!Number.isSafeInteger(total)) throw new Error("Review your cart before ordering.");
    return { productId: product.id, qty: line.qty, name: product.name, unitPrice,
      choices: choices.map(({id,name,kind,group,price}) => ({id,name,kind,group:group || "",price})) };
  });
  const now = new Date();
  return {
    id: `GK-${crypto.randomUUID().replaceAll("-", "").slice(0,16).toUpperCase()}`,
    merchantId: merchant.id,
    pickup: { name: merchant.name, address: merchant.address, area: merchant.area },
    fulfillment: "pickup", currency: "ZAR",
    customer: `${firstName} ${lastName}`.trim(),
    customerDetails: { firstName, lastName, phone, email },
    contact: { phone, email },
    paymentMethod: "pay_on_collection", paymentStatus: "unpaid",
    status: "new", items,
    total,
    createdAt: now.toLocaleString("en-ZA", {dateStyle: "medium", timeStyle: "short"}),
    createdIso: now.toISOString()
  };
}
