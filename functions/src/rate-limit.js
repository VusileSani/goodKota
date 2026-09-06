import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export async function enforceRateLimit(db, { scope, limit = 20, windowSeconds = 60 }) {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const ref = db.doc(`rateLimits/${String(scope).replace(/[^a-zA-Z0-9_-]/g, "_")}_${bucket}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (count >= limit) throw new HttpsError("resource-exhausted", "Too many requests.");
    tx.set(ref, { count: FieldValue.increment(1), bucket, expiresAt: new Date((bucket + 2) * windowSeconds * 1000) }, { merge: true });
  });
}
