import assert from "node:assert/strict";
import { createGoodKotaServer } from "../server/server.mjs";

let state, roles = {merchants:{},invites:[]};
const cloudStorage = {
  state:{read:async () => state ? structuredClone(state) : null,update:async operation => {
    const output = await operation(state ? structuredClone(state) : null);
    state = structuredClone(output.state);
    return output.result;
  }},
  roles:{read:async () => structuredClone(roles),update:async operation => {
    const copy = structuredClone(roles);
    const result = await operation(copy);
    roles = copy;
    return result;
  }}
};
const now = Math.floor(Date.now()/1000);
const people = new Map([
  ["c1",{uid:"c1",email:"customer@example.test",emailVerified:true}],
  ["bad",{uid:"bad",email:"unknown@example.test",emailVerified:true}],
  ["a1",{uid:"a1",email:"admin@example.test",emailVerified:true,multiFactor:{enrolledFactors:[]}}]
]);
const decoded = uid => ({uid,auth_time:now,firebase:{}});
const firebaseAuth = {verifyIdToken:async uid => decoded(uid),verifySessionCookie:async cookie => decoded(cookie.replace("cookie-","")),createSessionCookie:async uid => `cookie-${uid}`,getUser:async uid => people.get(uid)};
const server = createGoodKotaServer({storageProvider:"firestore",cloudStorage,firebaseAuth,adminUid:"a1",publicOrigin:"https://goodkota.web.app"});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (path,body,headers={}) => fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://goodkota.web.app",...headers},body:JSON.stringify(body)});
try {
  assert.equal((await (await fetch(base+"/api/health")).json()).status,"ok");
  // Any verified Firebase customer may establish a customer session. Merchant/admin privileges remain role-gated.
  const openCustomer = await post("/api/auth/exchange",{idToken:"bad"});
  assert.equal(openCustomer.status,200);
  assert.equal((await (await post("/api/auth/exchange",{idToken:"a1"})).json()).next,"mfa_enroll");
  assert.equal((await post("/api/auth/exchange",{idToken:"c1"},{Origin:"https://evil.example"})).status,403);
  const login = await post("/api/auth/exchange",{idToken:"c1"});
  assert.equal(login.status,200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"),/SameSite=Strict.*Secure/);
  const data = await (await fetch(base+"/api/data",{headers:{Cookie:cookie}})).json();
  assert.equal(data.state.accountId,"c1");
  assert.equal(data.state.orders.length,0);
  assert.equal((await post("/api/actions",{type:"favourite_toggle",payload:{merchantId:"m1"}},{Cookie:cookie})).status,200);
  const after = await (await fetch(base+"/api/data",{headers:{Cookie:cookie}})).json();
  assert.deepEqual(after.state.favourites,["m1"]);
  console.log("Cloud pilot HTTP, open customer registration, session and state boundary passed.");
} finally { await new Promise(resolve => server.close(resolve)); }
