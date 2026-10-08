import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFirebaseIdentity } from "../server/firebase-auth.mjs";

const dataDir = await mkdtemp(join(tmpdir(),"goodkota-firebase-roles-"));
let now = Date.UTC(2026,0,1);
const users = new Map([
  ["c1",{uid:"c1",email:"customer@example.test",emailVerified:false,disabled:false}],
  ["m1",{uid:"m1",email:"merchant@example.test",emailVerified:false,disabled:false}],
  ["a1",{uid:"a1",email:"admin@example.test",emailVerified:true,disabled:false,multiFactor:{enrolledFactors:[]}}]
]);
const decoded = (uid,factor) => ({uid,auth_time:now/1000,firebase:factor ? {sign_in_second_factor:factor} : {}});
const adminAuth = {
  verifyIdToken:async token => decoded(...token.split(":")),
  createSessionCookie:async token => `session:${token}`,
  verifySessionCookie:async cookie => decoded(...cookie.replace(/^session:/,"").split(":")),
  getUser:async uid => users.get(uid),
  generateEmailVerificationLink:async email => `https://goodkota.firebaseapp.com/__/auth/action?email=${encodeURIComponent(email)}`
};
try {
  const mail = [];
  const auth = createFirebaseIdentity({adminAuth,dataDir,adminUid:"a1",now:() => now,sendLink:async (email,link) => mail.push({email,link})});
  const customer = await auth.exchange("c1");
  assert.equal(customer.user.role,"customer");
  assert.equal(customer.user.emailVerified,false);
  assert.equal((await auth.fromToken(customer.token)).role,"customer");
  assert.equal((await auth.exchange("a1")).next,"mfa_enroll");
  assert.equal(await auth.fromToken("session:a1"),null,"Admin password-only token must not authorize a session");
  users.get("a1").multiFactor.enrolledFactors.push({factorId:"totp"});
  assert.equal((await auth.exchange("a1")).next,"mfa_verify");
  const admin = await auth.exchange("a1:totp");
  assert.equal((await auth.fromToken(admin.token)).role,"admin");
  const invitation = await auth.inviteMerchant(admin.user,"store-1","merchant@example.test");
  const merchantSession = await auth.exchange("m1");
  await assert.rejects(() => auth.claimMerchant(customer.user,invitation.code),/Verify your email/);
  await assert.rejects(() => auth.claimMerchant(merchantSession.user,"wrong"),/Verify your email/);
  await assert.rejects(() => auth.claimMerchant(merchantSession.user,invitation.code),/Verify your email/);
  users.get("m1").emailVerified = true;
  await auth.claimMerchant({...merchantSession.user,emailVerified:true},invitation.code);
  assert.equal((await auth.fromToken(merchantSession.token)).merchantId,"store-1");
  assert.equal((await auth.fromToken(merchantSession.token)).emailVerified,true);
  await assert.rejects(async () => auth.claimMerchant(await auth.fromToken(merchantSession.token),invitation.code),/already has access/);
  await auth.resendVerification(customer.user);
  assert.equal(mail.length,1);
  await assert.rejects(() => auth.resendVerification(customer.user),/Too many/);
  users.get("m1").disabled = true;
  assert.equal(await auth.fromToken(merchantSession.token),null);
  const file = join(dataDir,"roles.json");
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777,0o600);
  const contents = await readFile(file,"utf8");
  assert(!contents.includes(invitation.code));
  console.log("Firebase identity and role isolation passed.");
} finally { await rm(dataDir,{recursive:true,force:true}); }
