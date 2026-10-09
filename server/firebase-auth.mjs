import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const safeEmail = value => String(value || "").trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const sessionMs = 12 * 60 * 60 * 1000;

// Firebase authenticates people; these records grant access to a GoodKota store.
export function createFirebaseIdentity({adminAuth, dataDir, roleStorage, adminUid = "", pilotUids, now = () => Date.now(), sendLink = async () => { throw new Error("Email delivery is not configured."); }} = {}) {
  if (!adminAuth || (!dataDir && !roleStorage)) throw new Error("Firebase Admin Auth and private role storage are required.");
  const file = dataDir ? join(dataDir,"roles.json") : "";
  let records, loading, queue = Promise.resolve();
  const mailSent = new Map();
  const locked = operation => { const task = queue.then(operation); queue = task.catch(() => {}); return task; };
  const loadLocal = () => loading ||= (async () => {
    try { records = JSON.parse(await readFile(file,"utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; records = {merchants:{},invites:[]}; }
    if (!records.merchants || !Array.isArray(records.invites)) throw new Error("Role store is invalid.");
    return records;
  })();
  const load = async () => roleStorage ? roleStorage.read() : loadLocal();
  const save = async () => {
    await mkdir(dataDir,{recursive:true,mode:0o700});
    const temp = join(dataDir,`roles-${randomBytes(12).toString("hex")}.tmp`);
    await writeFile(temp,JSON.stringify(records),{mode:0o600,flag:"wx"});
    await rename(temp,file);
  };
  const mutate = operation => roleStorage ? roleStorage.update(operation) : locked(async () => {
    const current = await loadLocal();
    const result = await operation(current);
    await save();
    return result;
  });
  const actorFrom = async decoded => {
    if (pilotUids && !pilotUids.has(decoded.uid)) return null;
    const roles = await load();
    const account = await adminAuth.getUser(decoded.uid);
    if (account.disabled || !account.email) return null;
    const role = decoded.uid === adminUid ? "admin" : roles.merchants[decoded.uid] ? "merchant" : "customer";
    if (role === "admin" && (!account.emailVerified || decoded.firebase?.sign_in_second_factor !== "totp")) return null;
    return {id:decoded.uid,email:account.email,role,merchantId:role === "merchant" ? roles.merchants[decoded.uid].merchantId : null,emailVerified:account.emailVerified === true};
  };
  const fromToken = async token => {
    if (!token) return null;
    try { return await actorFrom(await adminAuth.verifySessionCookie(token,true)); }
    catch { return null; }
  };
  const exchange = async idToken => {
    if (typeof idToken !== "string" || idToken.length > 8192) throw new Error("Invalid sign-in token.");
    const decoded = await adminAuth.verifyIdToken(idToken,true);
    if (pilotUids && !pilotUids.has(decoded.uid)) throw new Error("Pilot access is limited to invited testers.");
    if (!decoded.auth_time || Math.abs(now()/1000-decoded.auth_time) > 300) throw new Error("Sign in again to continue.");
    const account = await adminAuth.getUser(decoded.uid);
    if (account.disabled || !account.email) throw new Error("Account unavailable.");
    if (decoded.uid === adminUid) {
      if (!account.emailVerified) return {next:"verify_email"};
      if (decoded.firebase?.sign_in_second_factor !== "totp") {
        return {next:account.multiFactor?.enrolledFactors?.some(f => f.factorId === "totp") ? "mfa_verify" : "mfa_enroll"};
      }
    }
    const token = await adminAuth.createSessionCookie(idToken,{expiresIn:sessionMs});
    const user = await actorFrom(decoded);
    if (!user) throw new Error("Account unavailable.");
    return {user,token};
  };
  const inviteMerchant = (actor,merchantId,emailInput) => mutate(async records => {
    if (actor?.role !== "admin") throw new Error("Not authorised.");
    const email = safeEmail(emailInput);
    if (!validEmail(email) || !/^[\w-]{2,80}$/.test(merchantId || "")) throw new Error("Choose a valid merchant and email.");
    const code = randomBytes(24).toString("hex");
    const salt = randomBytes(16).toString("hex");
    const digest = await scrypt(code,salt,64);
    records.invites = records.invites.filter(i => i.merchantId !== merchantId || i.email !== email);
    records.invites.push({merchantId,email,salt,hash:digest.toString("hex"),expires:now()+72*60*60*1000});
    return {code,email,merchantId,expires:new Date(now()+72*60*60*1000).toISOString()};
  });
  const claimMerchant = (actor,code) => mutate(async records => {
    if (!actor?.id || !validEmail(actor.email) || typeof code !== "string" || code.length > 128) throw new Error("Sign in with the invited email and enter the code.");
    if (actor.role !== "customer") throw new Error("Account already has access.");
    const email = safeEmail(actor.email);
    const index = records.invites.findIndex(i => i.email === email && i.expires > now());
    const invite = records.invites[index];
    if (!invite) throw new Error("Invite is invalid or expired.");
    const actual = await scrypt(code,invite.salt,64);
    const expected = Buffer.from(invite.hash,"hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) throw new Error("Invite is invalid or expired.");
    records.merchants[actor.id] = {merchantId:invite.merchantId,email};
    records.invites.splice(index,1);
    return {claimed:true};
  });
  const rolesForUids = async uids => {
    const roles = await load();
    return Object.fromEntries((uids || []).map(uid => [uid, uid === adminUid ? "admin" : roles.merchants[uid] ? "merchant" : "customer"]));
  };
  const roleForUid = async uid => (await rolesForUids([uid]))[uid];
  const resendVerification = actor => locked(async () => {
    if (!actor || actor.emailVerified) return {sent:false};
    const last = mailSent.get(actor.id) || 0;
    if (now()-last < 60_000) throw new Error("Too many requests. Try again in a minute.");
    const link = await adminAuth.generateEmailVerificationLink(actor.email);
    await sendLink(actor.email,link);
    mailSent.set(actor.id,now());
    return {sent:true};
  });
  return {load,fromToken,exchange,inviteMerchant,claimMerchant,resendVerification,roleForUid,rolesForUids,logout:() => {}};
}
