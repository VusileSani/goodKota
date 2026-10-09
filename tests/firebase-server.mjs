import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoodKotaServer } from "../server/server.mjs";

const dataDir = await mkdtemp(join(tmpdir(),"goodkota-firebase-http-"));
const now = Math.floor(Date.now()/1000);
const people = new Map([
  ["c1",{uid:"c1",email:"customer@example.test",emailVerified:true}],
  ["a1",{uid:"a1",email:"admin@example.test",emailVerified:true,multiFactor:{enrolledFactors:[{factorId:"totp"}]}}]
]);
const decoded = uid => ({uid,auth_time:now,firebase:{sign_in_second_factor:uid === "a1" ? "totp" : undefined}});
const firebaseAuth = {
  verifyIdToken:async id => decoded(id),
  createSessionCookie:async id => `cookie-${id}`,
  verifySessionCookie:async cookie => decoded(cookie.replace("cookie-","")),
  getUser:async uid => people.get(uid),
  listUsers:async () => ({users:[...people.values()],pageToken:undefined})
};
const server = createGoodKotaServer({authProvider:"firebase",firebaseAuth,adminUid:"a1",authDir:join(dataDir,"auth"),stateDir:join(dataDir,"state"),dataDir:join(dataDir,"payfast")});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (path,body,headers={}) => fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
try {
  assert.equal((await post("/api/auth/login",{email:"admin@example.test",password:"anything"})).status,410);
  const exchange = await post("/api/auth/exchange",{idToken:"c1"});
  assert.equal(exchange.status,200);
  const cookie = exchange.headers.get("set-cookie").split(";")[0];
  const session = await (await fetch(base+"/api/auth/session",{headers:{Cookie:cookie}})).json();
  assert.deepEqual([session.user.role,session.user.emailVerified],["customer",true]);
  assert.equal((await post("/api/auth/invite",{merchantId:"m1",email:"bad@example.test"},{Cookie:cookie})).status,403);
  assert.equal((await post("/api/auth/claim",{code:"invalid"},{Cookie:cookie})).status,401);
  const profileSave = await post("/api/actions",{type:"customer_details_saved",payload:{fields:{firstName:"Nandi",lastName:"Dube",phone:"0111111111",email:"spoof@example.test"}}},{Cookie:cookie});
  assert.equal(profileSave.status,200);
  const adminExchange = await post("/api/auth/exchange",{idToken:"a1"});
  assert.equal(adminExchange.status,200);
  const adminCookie = adminExchange.headers.get("set-cookie").split(";")[0];
  const directory = await (await fetch(base+"/api/admin/customers",{headers:{Cookie:adminCookie}})).json();
  const listed = directory.customers.find(item => item.id === "c1");
  assert.deepEqual([listed.firstName,listed.lastName,listed.phone,listed.profileComplete,listed.orderCount],["Nandi","Dube","0111111111",true,0]);
  assert.equal((await fetch(base+"/api/data",{headers:{Cookie:cookie}})).status,200);
  console.log("Firebase session HTTP boundary passed.");
} finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir,{recursive:true,force:true}); }
