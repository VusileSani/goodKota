import { HttpsError } from "firebase-functions/v2/https";

export function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return request.auth;
}

export function requireRole(request, allowed) {
  const auth = requireAuth(request);
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const claims = auth.token || {};
  const roleMap = {
    owner: claims.goodkotaOwner === true,
    admin: claims.goodkotaOwner === true || claims.goodkotaAdmin === true,
    delivery: claims.goodkotaOwner === true || claims.goodkotaAdmin === true || claims.deliveryOps === true
  };
  if (!list.some(role => roleMap[role])) throw new HttpsError("permission-denied", "Insufficient Yagoya authority.");
  return auth;
}
