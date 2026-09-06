export const REGION = "africa-south1";
export const PLATFORM_CONFIG = "platformConfig/current";

export const ALLOWED_ORDER_TRANSITIONS = {
  pending: ["accepted", "rejected"],
  accepted: ["ready", "cancelled"],
  ready: [],
  out_for_delivery: []
};

export function cents(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error("Money must be a non-negative integer number of cents.");
  return n;
}
