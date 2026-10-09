import http from "node:http";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createAuth } from "./auth.mjs";
import { createVerificationMailer, createLinkMailer, createOrderReadyMailer } from "./mail.mjs";
import { firebaseAdminAuth, firebaseAdminFirestore } from "./firebase-admin.mjs";
import { createFirebaseIdentity } from "./firebase-auth.mjs";
import { createStateRepository } from "./state.mjs";
import { createFirestoreStorage } from "./firestore-storage.mjs";
import { httpError } from "./errors.mjs";
import { requestIdFor, logRequestError } from "./request-context.mjs";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".png":"image/png", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml" };
const securityHeaders = {"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Permissions-Policy":"geolocation=(self), camera=(), microphone=(), payment=()","Strict-Transport-Security":"max-age=31536000; includeSubDomains","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const json = (response, status, data) => {
  response.writeHead(status, {...securityHeaders,"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  response.end(JSON.stringify(data));
};
const sameToken = (actual, expected) => {
  const candidate = Buffer.from(typeof actual === "string" && actual.startsWith("Bearer ") ? actual.slice(7) : "");
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
};
const limitedJson = async (request, maxBytes = 4096) => {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("Send JSON.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Setup request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

export function createGoodKotaServer({
  root = defaultRoot,
  dataDir = join(homedir(), ".goodkota", "payfast"),
  token = process.env.GOODKOTA_SETUP_TOKEN,
  encryptionKey = process.env.GOODKOTA_CONFIG_KEY,
  publicOrigin = process.env.GOODKOTA_PUBLIC_ORIGIN || "",
  authDir = join(homedir(), ".goodkota", "auth"),
  stateDir = join(homedir(), ".goodkota", "state"),
  adminEmail = process.env.GOODKOTA_ADMIN_EMAIL || "",
  adminPassword = process.env.GOODKOTA_ADMIN_PASSWORD || "",
  authProvider = process.env.GOODKOTA_AUTH_PROVIDER || "firebase",
  firebaseAuth,
  cloudStorage,
  storageProvider = process.env.GOODKOTA_STORAGE || "local",
  adminUid = process.env.GOODKOTA_ADMIN_UID || "",
  mailApiKey = process.env.RESEND_API_KEY || "",
  mailFrom = process.env.GOODKOTA_MAIL_FROM || "",
  devMail = process.env.GOODKOTA_DEV_MAIL === "1",
  sendVerification,
  sendOrderReady
} = {}) {
  if (!["firebase","local"].includes(authProvider)) throw new Error("Unknown authentication provider.");
  if (!["local","firestore"].includes(storageProvider)) throw new Error("Unknown storage provider.");
  if (storageProvider === "firestore" && authProvider !== "firebase") throw new Error("Cloud storage requires Firebase authentication.");
  if (authProvider === "local" && publicOrigin && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(publicOrigin)) throw new Error("Local account mode is only for loopback testing.");
  const payfastConfigured = Boolean(token && encryptionKey);
  if ((token || encryptionKey) && (!token || token.length < 32)) throw new Error("Set a random GOODKOTA_SETUP_TOKEN of at least 32 characters.");
  const key = Buffer.from(encryptionKey || "", "base64");
  if ((token || encryptionKey) && key.length !== 32) throw new Error("GOODKOTA_CONFIG_KEY must be 32 random bytes encoded in base64.");
  if (devMail && publicOrigin && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(publicOrigin)) throw new Error("Development mail is only available on loopback.");
  if (storageProvider === "firestore" && payfastConfigured) throw new Error("Payfast key storage is not available in the cloud pilot.");
  const storage = storageProvider === "firestore" ? cloudStorage || createFirestoreStorage(firebaseAdminFirestore()) : null;
  const mailer = sendVerification || createVerificationMailer({apiKey:mailApiKey,from:mailFrom,publicOrigin,devMail,dataDir:authDir});
  const auth = authProvider === "firebase" ? createFirebaseIdentity({adminAuth:firebaseAuth || firebaseAdminAuth(),dataDir:authDir,roleStorage:storage?.roles,adminUid,sendLink:createLinkMailer({apiKey:mailApiKey,from:mailFrom,devMail,dataDir:authDir})}) : createAuth({dataDir:authDir,adminEmail,adminPassword,sendVerification:mailer});
  const mailReady = Boolean(sendVerification || devMail || (mailApiKey && mailFrom && publicOrigin.startsWith("https://")));
  const orderReadyMailer = sendOrderReady || (devMail || (mailApiKey && mailFrom) ? createOrderReadyMailer({apiKey:mailApiKey,from:mailFrom,devMail,dataDir:authDir}) : null);
  const orderReadyEmailAvailable = Boolean(orderReadyMailer);
  const repository = createStateRepository({dataDir:stateDir,storage:storage?.state});
  const fileFor = storeId => {
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(storeId || "")) throw new Error("Choose a valid GoodKota store.");
    return join(dataDir, `payfast-${storeId}.enc.json`);
  };

  const readConfig = async storeId => {
    let record;
    try { record = JSON.parse(await readFile(fileFor(storeId), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8"));
  };
  const saveConfig = async (storeId, config) => {
    const file = fileFor(storeId);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
    const record = {iv:iv.toString("base64"), tag:cipher.getAuthTag().toString("base64"), ciphertext:encrypted.toString("base64")};
    await mkdir(dataDir, {recursive:true, mode:0o700});
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record), {mode:0o600, flag:"wx"});
    await rename(temporary, file);
  };

  return http.createServer(async (request, response) => {
    let url;
    try { url = new URL(request.url || "/", "http://localhost"); }
    catch { json(response,400,{error:"Invalid request URL."}); return; }
    const path = url.pathname;
    const requestId = requestIdFor(request);
    response.setHeader("X-Request-Id",requestId);
    const sessionToken = (request.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith("__session="))?.slice("__session=".length) || "";
    const challengeToken = (request.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith("goodkota_mfa="))?.slice("goodkota_mfa=".length) || "";
    const cookie = token => `__session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${publicOrigin.startsWith("https://") ? "; Secure" : ""}`;
    const challengeCookie = token => `goodkota_mfa=${token}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${token ? 600 : 0}${publicOrigin.startsWith("https://") ? "; Secure" : ""}`;
    const origin = request.headers.origin;
    const expectedOrigin = publicOrigin || `http://${request.headers.host}`;
    if (path === "/api/health" && request.method === "GET") {
      try {
        if (storage) await Promise.all([storage.state.read(),storage.roles.read()]);
        json(response,200,{status:"ok"});
      } catch { json(response,503,{status:"unavailable"}); }
      return;
    }
    if (path === "/api/admin/customers" && request.method === "GET") {
      try {
        const actor = await auth.fromToken(sessionToken);
        if (!actor) { json(response,401,{error:"Sign in to continue."}); return; }
        if (actor.role !== "admin") { json(response,403,{error:"Administrator access required."}); return; }
        if (authProvider !== "firebase") { json(response,501,{error:"Customer directory requires Firebase Authentication."}); return; }
        const pageToken = url.searchParams.get("pageToken") || undefined;
        if (pageToken && (pageToken.length > 4096 || /[\x00-\x20\x7f]/.test(pageToken))) { json(response,400,{error:"Invalid page token."}); return; }
        const result = await (firebaseAuth || firebaseAdminAuth()).listUsers(100,pageToken);
        const adminState = await repository.snapshot(actor);
        const roleMap = typeof auth.rolesForUids === "function" ? await auth.rolesForUids(result.users.map(user => user.uid)) : {};
        const orderStats = new Map();
        for (const order of adminState.orders || []) {
          if (!order.customerId) continue;
          const current = orderStats.get(order.customerId) || {count:0,lastOrderAt:null};
          current.count += 1;
          if (!current.lastOrderAt || String(order.createdIso || "") > current.lastOrderAt) current.lastOrderAt = order.createdIso || null;
          orderStats.set(order.customerId,current);
        }
        const customers = result.users.map(u => {
          const role = roleMap[u.uid] || (u.uid === adminUid ? "admin" : "customer");
          const profile = adminState.profiles?.[u.uid]?.customerDetails || {};
          const stats = role === "customer" ? orderStats.get(u.uid) || {count:0,lastOrderAt:null} : {count:0,lastOrderAt:null};
          return {id:u.uid,email:u.email || "",role,emailVerified:u.emailVerified === true,disabled:u.disabled === true,createdAt:u.metadata?.creationTime || null,lastSignInAt:u.metadata?.lastSignInTime || null,firstName:profile.firstName || "",lastName:profile.lastName || "",phone:profile.phone || "",profileComplete:Boolean(profile.firstName && profile.lastName && profile.phone && u.email),orderCount:stats.count,lastOrderAt:stats.lastOrderAt};
        });
        json(response,200,{customers,nextPageToken:result.pageToken || null});
      } catch (error) { logRequestError({requestId,path,error}); json(response,503,{error:"Customer directory temporarily unavailable.",requestId}); }
      return;
    }
    if (path === "/api/data" && request.method === "GET") {
      try { json(response, 200, {state:await repository.snapshot(await auth.fromToken(sessionToken))}); }
      catch { json(response, 500, {error:"Data unavailable."}); }
      return;
    }
    if (path === "/api/actions" && request.method === "POST") {
      if (origin && origin !== expectedOrigin) { json(response, 403, {error:"Origin not allowed."}); return; }
      let user;
      try { user = await auth.fromToken(sessionToken); }
      catch { json(response,503,{error:"Authentication temporarily unavailable."}); return; }
      if (!user) { json(response, 401, {error:"Sign in to continue."}); return; }
      try {
        const input = await limitedJson(request, 65536);
        const nextState = await repository.apply(user,input.type,input.payload);
        let notificationDelivery = null;
        if (input.type === "order_status_changed" && input.payload?.status === "ready") {
          const order = nextState.orders.find(item => item.id === input.payload.orderId && item.status === "ready");
          if (order) {
            if (orderReadyMailer) {
              try {
                await orderReadyMailer({to:order.contact?.email,customerName:order.customer,orderId:order.id,merchantName:order.pickup?.name,pickupAddress:order.pickup?.address});
                notificationDelivery = {channel:"email",status:"sent"};
              } catch (deliveryError) {
                notificationDelivery = {channel:"email",status:"failed"};
                logRequestError({requestId,path:"/api/notifications/order-ready",error:deliveryError});
              }
            } else notificationDelivery = {channel:"email",status:"not_configured"};
          }
        }
        json(response, 200, {state:nextState,notificationDelivery});
      } catch (error) {
        const failure = httpError(error);
        logRequestError({requestId,path,error});
        json(response,failure.status,{error:failure.message,code:failure.code,requestId});
      }
      return;
    }
    if (path.startsWith("/api/auth/")) {
      if (request.method !== "GET" && origin && origin !== expectedOrigin) { json(response, 403, {error:"Origin not allowed."}); return; }
      try {
        if (path === "/api/auth/session" && request.method === "GET") {
          json(response, 200, {user:await auth.fromToken(sessionToken)}); return;
        }
        if (path === "/api/auth/capabilities" && request.method === "GET") {
          json(response,200,{provider:authProvider,resendAvailable:Boolean(devMail || (mailApiKey && mailFrom)),orderReadyEmailAvailable}); return;
        }
        if (path === "/api/auth/exchange" && request.method === "POST" && authProvider === "firebase") {
          const input = await limitedJson(request,10000);
          const result = await auth.exchange(input.idToken);
          if (result.next) { response.setHeader("Set-Cookie",cookie("")); json(response,403,{next:result.next,error:result.next === "verify_email" ? "Verify your email before admin access." : "Complete authenticator setup to continue."}); return; }
          response.setHeader("Set-Cookie",cookie(result.token));
          json(response,200,{user:result.user}); return;
        }
        if (path === "/api/auth/logout" && request.method === "POST") {
          auth.logout(sessionToken);
          response.setHeader("Set-Cookie", [cookie(""),challengeCookie("")]);
          json(response, 200, {user:null}); return;
        }
        if (path === "/api/auth/login" && request.method === "POST") {
          if (authProvider === "firebase") { json(response,410,{error:"Use Firebase sign-in."}); return; }
          const input = await limitedJson(request);
          const result = await auth.login(input.email, input.password, request.socket.remoteAddress || "unknown");
          if (result.next) {
            response.setHeader("Set-Cookie", [cookie(""),challengeCookie(result.challenge)]);
            json(response, 202, {next:result.next}); return;
          }
          response.setHeader("Set-Cookie", [cookie(result.token),challengeCookie("")]);
          json(response, 200, {user:result.user}); return;
        }
        if (path === "/api/auth/mfa/setup" && request.method === "GET") {
          if (authProvider === "firebase") { json(response,404,{error:"Not found."}); return; }
          json(response, 200, await auth.mfaSetup(challengeToken)); return;
        }
        if (path === "/api/auth/mfa/complete" && request.method === "POST") {
          if (authProvider === "firebase") { json(response,404,{error:"Not found."}); return; }
          const input = await limitedJson(request);
          const result = await auth.completeMfa(challengeToken,input.code);
          response.setHeader("Set-Cookie", [cookie(result.token),challengeCookie("")]);
          json(response, 200, {user:result.user,backupCodes:result.backupCodes}); return;
        }
        if (path === "/api/auth/verify-email" && request.method === "POST") {
          if (authProvider === "firebase") { json(response,404,{error:"Use the Firebase email link."}); return; }
          const input = await limitedJson(request);
          json(response, 200, await auth.verifyEmail(input.token)); return;
        }
        if (path === "/api/auth/resend-verification" && request.method === "POST") {
          const user = await auth.fromToken(sessionToken);
          if (!user) { json(response, 401, {error:"Sign in to continue."}); return; }
          json(response, 200, await auth.resendVerification(user)); return;
        }
        if (path === "/api/auth/register" && request.method === "POST") {
          if (authProvider === "firebase") { json(response,410,{error:"Use Firebase signup."}); return; }
          if (!mailReady) { json(response, 503, {error:"Email delivery is not configured."}); return; }
          const input = await limitedJson(request);
          const result = await auth.registerCustomer(input);
          response.setHeader("Set-Cookie", cookie(result.token));
          json(response, 201, {user:result.user,mailPending:result.mailPending}); return;
        }
        if (path === "/api/auth/claim" && request.method === "POST") {
          if (authProvider === "firebase") {
            const actor = await auth.fromToken(sessionToken);
            if (!actor) { json(response,401,{error:"Sign in with the invited email first."}); return; }
            const input = await limitedJson(request);
            await auth.claimMerchant(actor,input.code);
            json(response,200,{user:await auth.fromToken(sessionToken)}); return;
          }
          if (!mailReady) { json(response, 503, {error:"Email delivery is not configured."}); return; }
          const input = await limitedJson(request);
          const result = await auth.claimMerchant(input);
          response.setHeader("Set-Cookie", cookie(result.token));
          json(response, 201, {user:result.user,mailPending:result.mailPending}); return;
        }
        if (path === "/api/auth/invite" && request.method === "POST") {
          const user = await auth.fromToken(sessionToken);
          if (user?.role !== "admin") { json(response, 403, {error:"Not authorised."}); return; }
          const input = await limitedJson(request);
          if (!(await repository.hasMerchant(input.merchantId))) { json(response, 400, {error:"Choose an existing merchant."}); return; }
          json(response, 201, await auth.inviteMerchant(user, input.merchantId, input.email)); return;
        }
        json(response, 404, {error:"Not found."});
      } catch (error) {
        const message = error.message || "";
        const status = message.startsWith("Too many") ? 429 : message === "Pilot access is limited to invited testers." || message === "Not authorised." ? 403 : message === "Email or password is incorrect." || message === "Invite is invalid or expired." || message === "Invalid sign-in token." || message === "Sign in again to continue." ? 401 : message.startsWith("Email delivery") || message.startsWith("Email could not") ? 503 : 400;
        json(response, status, {error: status === 400 && (error instanceof SyntaxError || message === "Send JSON." || message === "Setup request is too large.") ? "Check the form and try again." : status === 400 && !["Enter a valid email and a password of at least 12 characters.", "That email already has an account.", "Choose a valid merchant and email.", "Check your email, invite code and password.", "Verification link is invalid or expired.", "MFA challenge expired. Sign in again.", "Incorrect code. Check your authenticator and try again."].includes(message) ? "Account request could not be completed." : message});
      }
      return;
    }
    if (path === "/api/admin/payfast/capabilities" && request.method === "GET") {
      json(response, 200, {secureSetup:payfastConfigured, checkoutActive:false}); return;
    }
    if (path.startsWith("/api/")) {
      if (path !== "/api/admin/payfast/status" && path !== "/api/admin/payfast/config") { json(response, 404, {error:"Not found."}); return; }
      const user = await auth.fromToken(sessionToken);
      if (user?.role !== "admin") { json(response, 403, {error:"GoodKota admin sign-in required."}); return; }
      if (!payfastConfigured) { json(response, 503, {error:"Payment setup is not configured."}); return; }
      if (!sameToken(request.headers.authorization || "", token)) { json(response, 401, {error:"Invalid setup access code."}); return; }
      if (origin && origin !== expectedOrigin) { json(response, 403, {error:"Origin not allowed."}); return; }
      try {
        if (path === "/api/admin/payfast/status" && request.method === "GET") {
          const storeId = url.searchParams.get("storeId");
          const saved = await readConfig(storeId);
          json(response, 200, saved ? {storeId, configured:true, environment:saved.environment, merchantIdMasked:`••••${saved.merchantId.slice(-4)}`, updatedAt:saved.updatedAt, checkoutActive:false} : {storeId, configured:false, checkoutActive:false});
          return;
        }
        if (path === "/api/admin/payfast/config" && request.method === "POST") {
          const input = await limitedJson(request);
          const storeId = String(input.storeId || "").trim();
          fileFor(storeId);
          const merchantId = String(input.merchantId || "").trim();
          const merchantKey = String(input.merchantKey || "").trim();
          const passphrase = String(input.passphrase || "").trim();
          const environment = input.environment;
          if (!/^\d{6,12}$/.test(merchantId) || !/^[a-zA-Z0-9]{8,64}$/.test(merchantKey) || passphrase.length > 32 || !["sandbox","live"].includes(environment)) {
            json(response, 400, {error:"Check the Merchant ID, Merchant Key, passphrase and environment."}); return;
          }
          await saveConfig(storeId, {merchantId, merchantKey, passphrase, environment, updatedAt:new Date().toISOString()});
          json(response, 200, {storeId, configured:true, checkoutActive:false}); return;
        }
        if (path === "/api/admin/payfast/config" && request.method === "DELETE") {
          const storeId = url.searchParams.get("storeId");
          try { await unlink(fileFor(storeId)); } catch (error) { if (error.code !== "ENOENT") throw error; }
          json(response, 200, {storeId, configured:false, checkoutActive:false}); return;
        }
        json(response, 405, {error:"Method not allowed."});
      } catch (error) {
        if (error.message === "Choose a valid GoodKota store." || error.message === "Send JSON." || error.message === "Setup request is too large." || error instanceof SyntaxError) json(response, 400, {error:"Invalid setup request or store."});
        else json(response, 500, {error:"Setup could not be saved. Check the server configuration."});
      }
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
    let relative;
    try { relative = decodeURIComponent(path === "/" ? "/index.html" : path); }
    catch { response.writeHead(400); response.end(); return; }
    if (!/^\/(index\.html|manifest\.webmanifest|service-worker\.js|(?:assets|css|js)\/[\w./-]+)$/.test(relative)) { response.writeHead(404); response.end(); return; }
    const absolute = resolve(root, `.${relative}`);
    if (!absolute.startsWith(resolve(root) + sep)) { response.writeHead(404); response.end(); return; }
    try {
      const content = await readFile(absolute);
      response.writeHead(200, {...securityHeaders,"Content-Type":types[extname(absolute)] || "application/octet-stream", "Cache-Control":"no-cache"});
      response.end(request.method === "HEAD" ? undefined : content);
    } catch { response.writeHead(404); response.end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createGoodKotaServer();
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "127.0.0.1";
  if (!["127.0.0.1","::1","localhost"].includes(host) && !process.env.GOODKOTA_PUBLIC_ORIGIN?.startsWith("https://")) {
    throw new Error("A public listener requires GOODKOTA_PUBLIC_ORIGIN set to its HTTPS origin.");
  }
  server.listen(port, host, () => process.stdout.write(`GoodKota preview at http://${host}:${port}\n`));
}
