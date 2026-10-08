import { createHash } from "node:crypto";

// v23 storage layout. Operational entities are separate Firestore documents.
// The state adapter intentionally preserves v22's atomic repository contract while
// domain commands are migrated to targeted repositories. This removes the 1 MiB
// state-document ceiling without pretending the compatibility transaction is the
// final high-throughput design.
const emptyRoles = () => ({merchants:{},invites:[]});
const asJson = value => JSON.parse(JSON.stringify(value));
const entityCollections = Object.freeze({
  merchants:"merchants",
  orders:"orders",
  applications:"merchant_applications",
  supportCases:"support_cases",
  profiles:"customer_profiles",
  events:"audit_events"
});
const legacyCollection = "goodkota_pilot_private";
const metaCollection = "goodkota_system";
const metaDocument = "state";
const rolesDocument = "roles";
const canonical = value => JSON.stringify(value,(_key,item) => item && !Array.isArray(item) && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
const stableEventId = event => createHash("sha256").update(canonical(event)).digest("hex").slice(0,32);
const safeDocumentId = id => {
  const value = String(id);
  if (!value || value === "." || value === ".." || value.includes("/") || /[\x00-\x1f]/.test(value) || Buffer.byteLength(value,"utf8") > 1500) throw new Error("Invalid Firestore document ID.");
  return value;
};
const docId = (kind,value,index) => {
  if (kind === "profiles") return safeDocumentId(index);
  if (kind === "events") return safeDocumentId(stableEventId(value));
  if (!value?.id) throw new Error(`Cannot persist ${kind} without an id.`);
  return safeDocumentId(value.id);
};
const rows = (kind,value) => {
  const entries = kind === "profiles" ? Object.entries(value || {}).map(([id,item]) => [safeDocumentId(id),item]) : (value || []).map((item,index) => [docId(kind,item,index),item]);
  if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error(`Duplicate ${kind} document ID.`);
  return entries;
};
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

async function queryData(reader, collection) {
  const snapshot = await reader.get(collection);
  const docs = snapshot?.docs || [];
  return docs.map(doc => ({id:doc.id,...asJson(doc.data())}));
}

function unpack(kind,docs) {
  if (kind === "profiles") return Object.fromEntries(docs.map(({id,...value}) => [id,value]));
  if (kind === "events") return docs.map(({id:_,...value}) => value).sort((a,b) => String(a.at).localeCompare(String(b.at)));
  return docs.map(({id,...value}) => ({id,...value}));
}

async function readPartitioned(firestore, reader = null) {
  const source = reader || {get:ref => ref.get()};
  const metaRef = firestore.collection(metaCollection).doc(metaDocument);
  const metaSnap = await source.get(metaRef);
  const meta = metaSnap.data();
  if (!meta?.schemaVersion) return null;
  const result = {revision:meta.revision || 0,location:meta.location || "Midrand",locations:meta.locations || ["Midrand","Tembisa","Centurion"]};
  for (const [kind,name] of Object.entries(entityCollections)) result[kind] = unpack(kind,await queryData(source,firestore.collection(name)));
  return result;
}

async function readLegacy(firestore, reader = null) {
  const ref = firestore.collection(legacyCollection).doc("operations");
  const snapshot = reader ? await reader.get(ref) : await ref.get();
  return snapshot.data()?.state || null;
}

function writeDiff(transaction,firestore,current,next) {
  // Firestore transactions have a finite write budget. Reject atomically before staging writes.
  const changes = [];
  const metaRef = firestore.collection(metaCollection).doc(metaDocument);
  changes.push(["set",metaRef,{schemaVersion:23,revision:next.revision || 0,location:next.location || "Midrand",locations:asJson(next.locations || ["Midrand","Tembisa","Centurion"]),updatedAt:new Date().toISOString()}]);
  for (const [kind,name] of Object.entries(entityCollections)) {
    const before = new Map(rows(kind,current?.[kind] || (kind === "profiles" ? {} : [])));
    const after = new Map(rows(kind,next?.[kind] || (kind === "profiles" ? {} : [])));
    for (const [id,value] of after) if (!same(before.get(id),value)) changes.push(["set",firestore.collection(name).doc(id),asJson(value)]);
    for (const id of before.keys()) if (!after.has(id)) changes.push(["delete",firestore.collection(name).doc(id)]);
  }
  if (changes.length > 450) throw new Error("Firestore compatibility transaction exceeds safe write budget; migrate to targeted commands.");
  for (const [action,ref,value] of changes) action === "set" ? transaction.set(ref,value) : transaction.delete(ref);
}

export function createFirestoreStorage(firestore) {
  if (!firestore?.collection || !firestore?.runTransaction) throw new Error("Firestore is required for cloud storage.");
  const roleRef = firestore.collection(legacyCollection).doc(rolesDocument);
  return {
    state: {
      read: async () => (await readPartitioned(firestore)) || (await readLegacy(firestore)),
      update: operation => firestore.runTransaction(async transaction => {
        const current = (await readPartitioned(firestore,transaction)) || (await readLegacy(firestore,transaction));
        const baseline = current ? asJson(current) : null;
        const {state,result} = await operation(current);
        writeDiff(transaction,firestore,baseline,state);
        return result;
      })
    },
    roles: {
      read: async () => (await roleRef.get()).data()?.roles || emptyRoles(),
      update: operation => firestore.runTransaction(async transaction => {
        const roles = (await transaction.get(roleRef)).data()?.roles || emptyRoles();
        const result = await operation(roles);
        transaction.set(roleRef,{roles:asJson(roles),schemaVersion:23});
        return result;
      })
    }
  };
}
