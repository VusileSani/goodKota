import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStateRepository } from "../server/state.mjs";
import { Store } from "../js/core/store.js";
import { buildPickupOrder } from "../js/core/checkout.js";
import { saveMerchant } from "../js/core/operations.js";

const dataDir = await mkdtemp(join(tmpdir(),"goodkota-client-test-"));
const repo = createStateRepository({dataDir});
const customer = {id:"c1",role:"customer",email:"nandi@example.test",emailVerified:true};
const merchant = {id:"u1",role:"merchant",emailVerified:true,merchantId:"m1"};
globalThis.sessionStorage = {getItem() { return null; },setItem() {},removeItem() {}};
let actingAs;
globalThis.fetch = async (_path,options) => {
  const {type,payload} = JSON.parse(options.body);
  try { return {ok:true,json:async () => ({state:await repo.apply(actingAs,type,payload)})}; }
  catch (error) { return {ok:false,json:async () => ({error:error.message})}; }
};
try {
  actingAs = customer;
  const customerStore = new Store(await repo.snapshot(customer),customer);
  const pickupMerchant = customerStore.merchant("m1");
  const cart = [{productId:"p1",name:"Classic Kota",unitPrice:4800,qty:1,choices:[]}];
  const order = buildPickupOrder({firstName:"Nandi",lastName:"Dube",phone:"0111111111",email:"nandi@example.test"},pickupMerchant,cart);
  customerStore.state.orders.unshift(order);
  assert.equal((await customerStore.log("pickup_order_created",{orderId:order.id,merchantId:"m1"})).ok,true);
  assert.equal(customerStore.state.orders[0].customerId,customer.id);
  assert.notEqual(customerStore.state.orders[0].id,order.id,"The server issues the final order reference");
  actingAs = merchant;
  const merchantStore = new Store(await repo.snapshot(merchant),merchant);
  saveMerchant(merchantStore,"m1",{name:"Kasi Bites Midrand",area:"Halfway House, Midrand",address:"12 New Street, Midrand",prepMinutes:"14",contactName:"Operator",phone:"0123456789",email:"operator@example.test"});
  await merchantStore.queue;
  assert.equal((await repo.snapshot(merchant)).merchants[0].contact.phone,"0123456789");
  assert.equal((await repo.snapshot(customer)).merchants[0].address,"12 New Street, Midrand");
  console.log("Client-to-server order and merchant sync passed.");
} finally { await rm(dataDir,{recursive:true,force:true}); }
