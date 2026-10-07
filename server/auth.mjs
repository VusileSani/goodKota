import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const normalizeEmail = value => String(value || "").trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validPassword = value => typeof value === "string" && value.length >= 12 && value.length <= 128;
const expiry = 12 * 60 * 60 * 1000;
const inviteExpiry = 72 * 60 * 60 * 1000;
const verifyExpiry = 24 * 60 * 60 * 1000;
const digest = value => createHash("sha256").update(value).digest("hex");
const base32 = bytes => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits -= 5)) & 31]; } }
  if (bits) result += alphabet[(value << (5-bits)) & 31];
  return result;
};
const decode32 = input => {
  let bits = 0, value = 0; const bytes = [];
  for (const character of input) { value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits -= 8)) & 255); } }
  return Buffer.from(bytes);
};
export const totpCode = (secret, step) => {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", decode32(secret)).update(counter).digest();
  const offset = hmac[19] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6,"0");
};

export function createAuth({dataDir, adminEmail = "", adminPassword = "", now = () => Date.now(), sendVerification = async () => { throw new Error("Email delivery is not configured."); }} = {}) {
  if (!dataDir) throw new Error("Auth data directory is required.");
  const accountsFile = join(dataDir, "accounts.json");
  const sessions = new Map();
  const attempts = new Map();
  const mfaFailures = new Map();
  const challenges = new Map();
  let dummyHash;
  let accounts;
  let loading;
  let queue = Promise.resolve();
  const locked = operation => {
    const task = queue.then(operation);
    queue = task.catch(() => {});
    return task;
  };
  const hashPassword = async password => {
    const salt = randomBytes(16);
    const digest = await scrypt(password, salt, 64, {N:16384,r:8,p:1,maxmem:32*1024*1024});
    return `${salt.toString("base64")}:${digest.toString("base64")}`;
  };
  const matches = async (password, hash) => {
    const [salt, expected] = hash.split(":");
    const actual = await scrypt(password, Buffer.from(salt, "base64"), 64, {N:16384,r:8,p:1,maxmem:32*1024*1024});
    const stored = Buffer.from(expected, "base64");
    return stored.length === actual.length && timingSafeEqual(stored, actual);
  };
  const save = async () => {
    await mkdir(dataDir, {recursive:true,mode:0o700});
    const temp = join(dataDir, `accounts-${randomBytes(12).toString("hex")}.tmp`);
    await writeFile(temp, JSON.stringify(accounts), {flag:"wx",mode:0o600});
    await rename(temp, accountsFile);
  };
  const load = () => loading ||= (async () => {
    try { accounts = JSON.parse(await readFile(accountsFile, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; accounts = {users:[],invites:[]}; }
    if (!Array.isArray(accounts.users) || !Array.isArray(accounts.invites)) throw new Error("Account store is invalid.");
    if (adminEmail && adminPassword && !accounts.users.some(user => user.role === "admin")) {
      const email = normalizeEmail(adminEmail);
      if (!validEmail(email) || !validPassword(adminPassword)) throw new Error("Configure a valid admin email and a password of at least 12 characters.");
      if (accounts.users.some(user => user.email === email)) throw new Error("Admin email already belongs to another account.");
      accounts.users.push({id:randomBytes(16).toString("hex"),email,role:"admin",emailVerified:true,merchantId:null,passwordHash:await hashPassword(adminPassword),createdAt:new Date(now()).toISOString()});
      await save();
    }
    return accounts;
  })();
  const publicUser = user => user && {id:user.id,email:user.email,role:user.role,merchantId:user.merchantId || null,emailVerified:user.emailVerified === true};
  const verification = async (user, force = false) => {
    if (user.emailVerified) return;
    if (!force && user.verificationSentAt && now()-user.verificationSentAt < 60_000) throw new Error("Too many requests. Try again in a minute.");
    const token = randomBytes(32).toString("hex");
    // Keep the previous link valid when delivery fails.
    await sendVerification(user.email, token);
    user.verificationHash = digest(token);
    user.verificationExpires = now()+verifyExpiry;
    user.verificationSentAt = now();
    await save();
  };
  const issueSession = user => {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, {userId:user.id,expires:now()+expiry});
    return token;
  };
  const fromToken = async token => {
    await load();
    const session = sessions.get(token || "");
    if (!session) return null;
    if (session.expires <= now()) { sessions.delete(token); return null; }
    session.expires = now()+expiry;
    return publicUser(accounts.users.find(user => user.id === session.userId));
  };
  const registerCustomer = fields => locked(async () => {
    await load();
    const email = normalizeEmail(fields.email);
    if (!validEmail(email) || !validPassword(fields.password)) throw new Error("Enter a valid email and a password of at least 12 characters.");
    if (accounts.users.some(user => user.email === email)) throw new Error("That email already has an account.");
    const user = {id:randomBytes(16).toString("hex"),email,role:"customer",emailVerified:false,merchantId:null,passwordHash:await hashPassword(fields.password),createdAt:new Date(now()).toISOString()};
    accounts.users.push(user);
    await save();
    let mailPending = false;
    try { await verification(user,true); } catch { mailPending = true; }
    return {user:publicUser(user),token:issueSession(user),mailPending};
  });
  const login = async (emailInput, password, source = "unknown") => {
    await load();
    const email = normalizeEmail(emailInput);
    const key = `${source}:${email}`;
    const previous = attempts.get(key) || {count:0,until:0};
    const entry = previous.until && previous.until <= now() ? {count:0,until:0} : previous;
    const sourceKey = `${source}:all`;
    const previousSource = attempts.get(sourceKey) || {count:0,until:0};
    const sourceEntry = previousSource.until && previousSource.until <= now() ? {count:0,until:0} : previousSource;
    if (entry.until > now() || sourceEntry.until > now()) throw new Error("Too many attempts. Try again later.");
    const user = accounts.users.find(item => item.email === email);
    dummyHash ||= hashPassword("not-a-real-user-password");
    const valid = await matches(typeof password === "string" ? password : "", user?.passwordHash || await dummyHash);
    if (!valid) {
      const count = entry.count + 1;
      attempts.set(key, {count,until:count >= 5 ? now()+15*60*1000 : 0});
      const sourceCount = sourceEntry.count + 1;
      attempts.set(sourceKey, {count:sourceCount,until:sourceCount >= 25 ? now()+15*60*1000 : 0});
      throw new Error("Email or password is incorrect.");
    }
    attempts.delete(key);
    attempts.delete(sourceKey);
    if (user.role === "admin") {
      const challenge = randomBytes(32).toString("hex");
      challenges.set(digest(challenge), {userId:user.id,expires:now()+10*60_000,attempts:0,setupSecret:user.mfa?.secret ? null : base32(randomBytes(20))});
      return {next:user.mfa?.secret ? "mfa_verify" : "mfa_enroll",challenge};
    }
    return {user:publicUser(user),token:issueSession(user)};
  };
  const pending = challenge => {
    const key = digest(challenge || "");
    const item = challenges.get(key);
    if (!item || item.expires <= now() || item.attempts >= 5) { challenges.delete(key); throw new Error("MFA challenge expired. Sign in again."); }
    const user = accounts.users.find(u => u.id === item.userId && u.role === "admin");
    if (!user) throw new Error("MFA challenge expired. Sign in again.");
    return {key,item,user};
  };
  const mfaSetup = async challenge => {
    await load();
    const {item,user} = pending(challenge);
    if (!item.setupSecret || user.mfa?.secret) throw new Error("MFA is already enrolled.");
    return {secret:item.setupSecret,uri:`otpauth://totp/GoodKota:${encodeURIComponent(user.email)}?secret=${item.setupSecret}&issuer=GoodKota&algorithm=SHA1&digits=6&period=30`};
  };
  const completeMfa = (challenge, code) => locked(async () => {
    await load();
    const {key,item,user} = pending(challenge);
    const failures = mfaFailures.get(user.id);
    if (failures?.until > now()) throw new Error("Too many attempts. Try again later.");
    const secret = user.mfa?.secret || item.setupSecret;
    const step = Math.floor(now()/30_000);
    const validStep = /^\d{6}$/.test(String(code)) ? [step-1,step,step+1].find(s => s > (user.mfa?.lastStep ?? -1) && totpCode(secret,s) === String(code)) : undefined;
    const backupIndex = user.mfa?.backupHashes?.indexOf(digest(String(code).trim().toUpperCase())) ?? -1;
    if (validStep === undefined && backupIndex < 0) {
      item.attempts++;
      const count = (failures?.count || 0)+1;
      mfaFailures.set(user.id,{count,until:count >= 5 ? now()+15*60_000 : 0});
      if (item.attempts >= 5) challenges.delete(key);
      throw new Error("Incorrect code. Check your authenticator and try again.");
    }
    let backupCodes;
    if (item.setupSecret) {
      backupCodes = Array.from({length:8}, () => randomBytes(8).toString("hex").toUpperCase());
      user.mfa = {secret:item.setupSecret,lastStep:validStep,backupHashes:backupCodes.map(digest)};
    } else if (validStep !== undefined) user.mfa.lastStep = validStep;
    else user.mfa.backupHashes.splice(backupIndex,1);
    await save();
    mfaFailures.delete(user.id);
    challenges.delete(key);
    return {user:publicUser(user),token:issueSession(user),backupCodes};
  });
  const resendVerification = actor => locked(async () => {
    await load();
    const user = accounts.users.find(u => u.id === actor?.id);
    if (!user) throw new Error("Sign in to continue.");
    await verification(user);
    return {sent:true};
  });
  const verifyEmail = token => locked(async () => {
    await load();
    if (!/^[a-f0-9]{64}$/.test(token || "")) throw new Error("Verification link is invalid or expired.");
    const user = accounts.users.find(u => u.verificationHash === digest(token) && u.verificationExpires > now());
    if (!user) throw new Error("Verification link is invalid or expired.");
    user.emailVerified = true;
    delete user.verificationHash;
    delete user.verificationExpires;
    await save();
    return {verified:true};
  });
  const inviteMerchant = (actor, merchantId, emailInput) => locked(async () => {
    await load();
    if (actor?.role !== "admin") throw new Error("Not authorised.");
    const email = normalizeEmail(emailInput);
    if (!validEmail(email) || !/^[a-zA-Z0-9_-]{2,80}$/.test(merchantId || "")) throw new Error("Choose a valid merchant and email.");
    if (accounts.users.some(user => user.email === email)) throw new Error("That email already has an account.");
    const code = randomBytes(24).toString("hex");
    const salt = randomBytes(16).toString("hex");
    const digest = await scrypt(code, salt, 64);
    accounts.invites = accounts.invites.filter(item => item.merchantId !== merchantId || item.email !== email);
    accounts.invites.push({merchantId,email,salt,hash:digest.toString("hex"),expires:now()+inviteExpiry});
    await save();
    return {code,email,merchantId,expires:new Date(now()+inviteExpiry).toISOString()};
  });
  const claimMerchant = fields => locked(async () => {
    await load();
    const email = normalizeEmail(fields.email);
    if (!validEmail(email) || !validPassword(fields.password) || typeof fields.code !== "string") throw new Error("Check your email, invite code and password.");
    const index = accounts.invites.findIndex(item => item.email === email && item.expires > now());
    const invite = accounts.invites[index];
    if (!invite || accounts.users.some(user => user.email === email)) throw new Error("Invite is invalid or expired.");
    const hash = await scrypt(fields.code, invite.salt, 64);
    const expected = Buffer.from(invite.hash, "hex");
    if (hash.length !== expected.length || !timingSafeEqual(hash, expected)) throw new Error("Invite is invalid or expired.");
    const user = {id:randomBytes(16).toString("hex"),email,role:"merchant",emailVerified:false,merchantId:invite.merchantId,passwordHash:await hashPassword(fields.password),createdAt:new Date(now()).toISOString()};
    accounts.users.push(user);
    accounts.invites.splice(index, 1);
    await save();
    let mailPending = false;
    try { await verification(user,true); } catch { mailPending = true; }
    return {user:publicUser(user),token:issueSession(user),mailPending};
  });
  const logout = token => sessions.delete(token || "");
  return {load,fromToken,registerCustomer,login,inviteMerchant,claimMerchant,logout,mfaSetup,completeMfa,resendVerification,verifyEmail};
}
