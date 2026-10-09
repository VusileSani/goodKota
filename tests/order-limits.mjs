import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStateRepository, ORDER_LIMITS } from "../server/state.mjs";

const dir = await mkdtemp(join(tmpdir(),"goodkota-limits-"));
const repo = createStateRepository({dataDir:dir});
const customer = id => ({id,role:"customer",email:`${id}@example.test`,emailVerified:true});
const merchantUser = {id:"mu",role:"merchant",emailVerified:true,merchantId:"m1"};
const details = {firstName:"Nandi",lastName:"D",phone:"0111111111",email:"n@example.test"};
const cartFor = (snap,mid,pid) => { const p = snap.merchants.find(m => m.id===mid).menu.find(i => i.id===pid); return [{productId:pid,name:p.name,unitPrice:p.price,qty:1,choices:[]}]; };
const ref = () => `GK-${Math.random().toString(16).slice(2,18).toUpperCase().padEnd(16,"0")}`;
try {
  const c1 = customer("c1");
  let snap = await repo.snapshot(c1);
  assert.ok(snap.merchants.every(m => m.lat != null && m.lng != null && m.distanceKm === undefined), "Public listings carry coordinates, not fake distances");
  assert.equal(snap.merchants.find(m => m.id==="m1").contact, undefined, "Merchant contact stays private");

  snap = await repo.apply(c1,"pickup_order_created",{merchantId:"m1",details,cart:cartFor(snap,"m1","p1"),requestId:ref()});
  assert.equal(snap.orders.length,1);
  await assert.rejects(repo.apply(c1,"pickup_order_created",{merchantId:"m1",details,cart:cartFor(snap,"m1","p1"),requestId:ref()}), /already have an open order/);
  snap = await repo.apply(c1,"pickup_order_created",{merchantId:"m2",details,cart:cartFor(snap,"m2","p4"),requestId:ref()});
  snap = await repo.apply(c1,"pickup_order_created",{merchantId:"m3",details,cart:cartFor(snap,"m3","p8"),requestId:ref()});
  assert.equal(snap.orders.length,ORDER_LIMITS.openPerCustomer);
  await assert.rejects(repo.apply(c1,"pickup_order_created",{merchantId:"m4",details,cart:cartFor(snap,"m4","p9"),requestId:ref()}), /too many open orders/);

  // Oversized orders are refused before any pricing work.
  const c2 = customer("c2");
  const big = [{...cartFor(snap,"m1","p1")[0],qty:ORDER_LIMITS.maxQtyPerLine+1}];
  await assert.rejects(repo.apply(c2,"pickup_order_created",{merchantId:"m1",details,cart:big,requestId:ref()}), /too large/);

  // A customer can cancel their own new order, and only their own.
  const own = snap.orders.find(o => o.merchantId === "m1");
  await assert.rejects(repo.apply(c2,"order_cancelled_by_customer",{orderId:own.id}), /unavailable/);
  snap = await repo.apply(c1,"order_cancelled_by_customer",{orderId:own.id});
  assert.equal(snap.orders.find(o => o.id===own.id).status,"cancelled");
  await assert.rejects(repo.apply(c1,"order_cancelled_by_customer",{orderId:own.id}), /no longer be cancelled/);
  // Cancelling frees the slot.
  snap = await repo.apply(c1,"pickup_order_created",{merchantId:"m1",details,cart:cartFor(snap,"m1","p1"),requestId:ref()});

  // Once a merchant accepts, the customer can no longer cancel.
  const fresh = snap.orders.find(o => o.merchantId==="m1" && o.status==="new");
  await repo.apply(merchantUser,"order_status_changed",{orderId:fresh.id,status:"accepted"});
  await assert.rejects(repo.apply(c1,"order_cancelled_by_customer",{orderId:fresh.id}), /no longer be cancelled/);
  // Customers still cannot drive merchant transitions.
  await assert.rejects(repo.apply(c1,"order_status_changed",{orderId:fresh.id,status:"ready"}), /unavailable/);

  // Merchant coordinates: valid saves persist, nonsense is rejected, omission keeps the old value.
  const fields = {name:"Kasi Bites Midrand",area:"Halfway House, Midrand",address:"Halfway House, Midrand",prepMinutes:14,contactName:"A",phone:"011",email:"a@b.co"};
  snap = await repo.apply(merchantUser,"merchant_updated",{merchantId:"m1",fields:{...fields,lat:"-25.99",lng:"28.13"}});
  assert.equal(snap.merchants[0].lat,-25.99);
  await assert.rejects(repo.apply(merchantUser,"merchant_updated",{merchantId:"m1",fields:{...fields,lat:"10",lng:"28.13"}}), /South African/);
  snap = await repo.apply(merchantUser,"merchant_updated",{merchantId:"m1",fields});
  assert.equal(snap.merchants[0].lat,-25.99,"Omitting coordinates keeps them");
  console.log("Order limits and coordinates passed.");
} finally { await rm(dir,{recursive:true,force:true}); }
