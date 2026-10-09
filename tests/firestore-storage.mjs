import assert from "node:assert/strict";
import { createFirestoreStorage } from "../server/firestore-storage.mjs";
import { createStateRepository } from "../server/state.mjs";
import { createFirebaseIdentity } from "../server/firebase-auth.mjs";

const documents = new Map();
let queue = Promise.resolve();
const clone = value => structuredClone(value);
const docSnapshot = ref => ({id:ref.id,data:() => documents.has(ref.path) ? clone(documents.get(ref.path)) : undefined});
const querySnapshot = collection => ({docs:[...documents.entries()].filter(([path]) => path.startsWith(`${collection.path}/`) && !path.slice(collection.path.length+1).includes("/")).map(([path,value]) => ({id:path.split("/").at(-1),data:() => clone(value)}))});
const snap = ref => ref.kind === "collection" ? querySnapshot(ref) : docSnapshot(ref);
const firestore = {
  collection(name) {
    const collection = {kind:"collection",path:name,get:async () => querySnapshot(collection)};
    collection.doc = id => { const ref = {kind:"doc",id,path:`${name}/${id}`,get:async () => docSnapshot(ref)}; return ref; };
    return collection;
  },
  runTransaction(operation) {
    const task = queue.then(async () => {
      const writes = [];
      const transaction = {get:async ref => snap(ref),set:(ref,value) => writes.push(["set",ref.path,clone(value)]),delete:ref => writes.push(["delete",ref.path])};
      const result = await operation(transaction);
      for (const [op,path,value] of writes) op === "set" ? documents.set(path,value) : documents.delete(path);
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
};
const cloud = createFirestoreStorage(firestore);
const repo1 = createStateRepository({storage:cloud.state});
const repo2 = createStateRepository({storage:cloud.state});
const customer = {id:"c1",role:"customer",email:"customer@example.test",emailVerified:true};
const other = {id:"c2",role:"customer",email:"other@example.test",emailVerified:true};
const merchant = {id:"m2",role:"merchant",emailVerified:true,merchantId:"m1"};

assert((await repo1.snapshot(null)).merchants.some(item => item.id === "m1"));
await Promise.all([repo1.apply(customer,"favourite_toggle",{merchantId:"m1"}),repo2.apply(other,"favourite_toggle",{merchantId:"m2"})]);
assert.deepEqual((await repo2.snapshot(customer)).favourites,["m1"]);
assert.deepEqual((await repo1.snapshot(other)).favourites,["m2"]);
assert(documents.has("goodkota_system/state"),"v23 metadata document should exist");
assert(documents.has("merchants/m1"),"merchants must be partitioned into individual documents");
assert(documents.has("customer_profiles/c1"),"customer profiles must be partitioned");
assert(!documents.has("goodkota_pilot_private/operations"),"new v23 state must not write the legacy operations document");
await assert.rejects(() => repo2.apply(other,"merchant_availability_changed",{merchantId:"m1",online:false}),/not assigned/);
const order = {merchantId:"m1",requestId:"GK-0000000000000001",details:{firstName:"Nandi",lastName:"Dube",phone:"0111111111",email:"nandi@example.test"},cart:[{productId:"p1",name:"Classic Kota",unitPrice:4800,qty:1,choices:[]}]};
await Promise.all([repo1.apply(customer,"pickup_order_created",order),repo2.apply(customer,"pickup_order_created",order)]);
assert.equal((await repo2.snapshot(customer)).orders.length,1,"Concurrent order retry must remain idempotent");
assert.equal((await repo1.snapshot(other)).orders.length,0);
assert.equal((await repo1.snapshot(merchant)).orders.length,1);
assert.equal([...documents.keys()].filter(key => key.startsWith("orders/")).length,1,"orders must be individual documents");

const users = new Map([["c1",{uid:"c1",email:"customer@example.test",emailVerified:true}],["m1",{uid:"m1",email:"merchant@example.test",emailVerified:true}],["a1",{uid:"a1",email:"admin@example.test",emailVerified:true,multiFactor:{enrolledFactors:[{factorId:"totp"}]}}]]);
const timestamp = Math.floor(Date.now()/1000);
const decoded = uid => ({uid,auth_time:timestamp,firebase:{sign_in_second_factor:uid === "a1" ? "totp" : undefined}});
const adminAuth = {getUser:async uid => users.get(uid),verifyIdToken:async uid => decoded(uid),verifySessionCookie:async cookie => decoded(cookie.replace("cookie-","")),createSessionCookie:async uid => `cookie-${uid}`};
const pilotUids = new Set(["a1","m1"]);
const first = createFirebaseIdentity({adminAuth,roleStorage:cloud.roles,adminUid:"a1",pilotUids});
const second = createFirebaseIdentity({adminAuth,roleStorage:cloud.roles,adminUid:"a1",pilotUids});
await assert.rejects(() => first.exchange("c1"),/Pilot access/);
const admin = await first.exchange("a1");
const invite = await first.inviteMerchant(admin.user,"m1","merchant@example.test");
const merchantSession = await second.exchange("m1");
assert.equal(merchantSession.user.role,"customer");
await second.claimMerchant(merchantSession.user,invite.code);
assert.equal((await first.fromToken(merchantSession.token)).merchantId,"m1","Roles must survive a different server instance");
await assert.rejects(() => second.claimMerchant(merchantSession.user,invite.code),/invalid or expired/);
assert(!JSON.stringify(documents.get("goodkota_pilot_private/roles")).includes(invite.code),"Invite code must never be stored in plaintext");
console.log("Firestore v23 partitioned storage, cross-instance isolation and order retry passed.");
