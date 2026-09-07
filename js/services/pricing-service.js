export function calculateOrderPricing({ merchant, items, productsById, promo = null, tipCents = 0, fulfilment = { type: "pickup" } }) {
  const lines = items.map(line => {
    const product = productsById(line.productId);
    if (!product || product.merchantId !== merchant.id || product.enabled === false) throw new Error("One or more menu items are no longer available.");
    const qty = Math.max(1, Number(line.qty || 1));
    return { productId: product.id, name: product.name, qty, priceCents: Number(product.priceCents || 0) };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
  const deliveryFeeCents = fulfilment?.type === "delivery" ? Number(merchant.deliveryFeeCents || 0) : 0;
  let discountCents = 0;
  if (promo) {
    if (promo.status !== "active") throw new Error("Promotion is not active.");
    if (subtotalCents < Number(promo.minCents || 0)) throw new Error("Order does not meet the promotion minimum.");
    discountCents = Math.round(subtotalCents * Math.max(0, Math.min(100, Number(promo.discountPercent || 0))) / 100);
  }
  const safeTipCents = Math.max(0, Math.round(Number(tipCents || 0)));
  const totalCents = subtotalCents - discountCents + deliveryFeeCents + safeTipCents;
  return { lines, subtotalCents, deliveryFeeCents, discountCents, tipCents: safeTipCents, totalCents, promoCode: promo?.code || "" };
}
