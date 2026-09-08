export function auditEvent({ actor, action, targetType, targetId, reason = "", visibility = "operations", metadata = {}, timestamp }) {
  return {
    actorUid: actor.uid,
    actorRole: actor.token?.yagoyaOwner ? "owner" : actor.token?.yagoyaAdmin ? "admin" : actor.token?.deliveryOps ? "delivery" : "authenticated",
    action, targetType, targetId, reason: String(reason || "").trim(), visibility, metadata, createdAt: timestamp
  };
}
