function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculatePricing({
  items,
  deliveryFee = 0,
  promo = null,
  tipPercent = 0
}) {
  const subtotal = roundMoney(items.reduce((sum, item) => {
    return sum + Number(item.unitPrice || 0) * Number(item.quantity || 0);
  }, 0));

  const eligiblePromo = promo && promo.status === "ACTIVE" && subtotal >= Number(promo.minimumSpend || 0)
    ? promo
    : null;

  const discount = roundMoney(eligiblePromo
    ? subtotal * (Number(eligiblePromo.discountPercent || 0) / 100)
    : 0);

  const tipBase = Math.max(0, subtotal - discount);
  const tip = roundMoney(tipBase * (Number(tipPercent || 0) / 100));
  const roundedDelivery = roundMoney(deliveryFee);
  const total = roundMoney(subtotal + roundedDelivery - discount + tip);

  return {
    subtotal,
    deliveryFee: roundedDelivery,
    discount,
    tip,
    total,
    promoCode: eligiblePromo?.code || null
  };
}
