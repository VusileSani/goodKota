export const ROLE = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  DELIVERY: "delivery",
  MERCHANT: "merchant",
  DRIVER: "driver",
  CUSTOMER: "customer"
});

export function requireRole(actor, allowed) {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!actor || !roles.includes(actor.role)) throw new Error("You do not have permission to perform this action.");
}

export function merchantScope(actor, merchantId) {
  if ([ROLE.OWNER, ROLE.ADMIN].includes(actor?.role)) return true;
  if (actor?.role === ROLE.MERCHANT && actor.merchantId === merchantId) return true;
  return false;
}
