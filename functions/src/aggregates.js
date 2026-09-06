import { FieldValue } from "firebase-admin/firestore";

function hash(value) {
  let result = 2166136261;
  for (const char of String(value || "global")) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
  return Math.abs(result >>> 0);
}

export function shardRef(db, metric, subjectId, shardCount = 20) {
  const shard = hash(subjectId) % shardCount;
  return db.doc(`aggregateShards/${metric}_${shard}`);
}

export async function incrementMetric(db, metric, subjectId, delta = 1) {
  await shardRef(db, metric, subjectId).set({ metric, value: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
