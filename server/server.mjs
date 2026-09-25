import http from "node:http";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".png":"image/png", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml" };
const json = (response, status, data) => {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
  response.end(JSON.stringify(data));
};
const sameToken = (actual, expected) => {
  const candidate = Buffer.from(actual.replace(/^Bearer /, ""));
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
};
const limitedJson = async request => {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("Send JSON.");
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (Buffer.byteLength(body) > 4096) throw new Error("Setup request is too large.");
  }
  return JSON.parse(body);
};

export function createGoodKotaServer({
  root = defaultRoot,
  dataDir = join(homedir(), ".goodkota", "payfast"),
  token = process.env.GOODKOTA_SETUP_TOKEN,
  encryptionKey = process.env.GOODKOTA_CONFIG_KEY,
  publicOrigin = process.env.GOODKOTA_PUBLIC_ORIGIN || ""
} = {}) {
  if (!token || token.length < 32) throw new Error("Set a random GOODKOTA_SETUP_TOKEN of at least 32 characters.");
  const key = Buffer.from(encryptionKey || "", "base64");
  if (key.length !== 32) throw new Error("GOODKOTA_CONFIG_KEY must be 32 random bytes encoded in base64.");
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
    const url = new URL(request.url || "/", "http://localhost");
    const path = url.pathname;
    if (path === "/api/admin/payfast/capabilities" && request.method === "GET") {
      json(response, 200, {secureSetup:true, checkoutActive:false}); return;
    }
    if (path.startsWith("/api/")) {
      if (path !== "/api/admin/payfast/status" && path !== "/api/admin/payfast/config") { json(response, 404, {error:"Not found."}); return; }
      if (!sameToken(request.headers.authorization || "", token)) { json(response, 401, {error:"Invalid setup access code."}); return; }
      const origin = request.headers.origin;
      const expectedOrigin = publicOrigin || `http://${request.headers.host}`;
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
      response.writeHead(200, {"Content-Type":types[extname(absolute)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":"no-cache"});
      response.end(request.method === "HEAD" ? undefined : content);
    } catch { response.writeHead(404); response.end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createGoodKotaServer();
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => process.stdout.write(`GoodKota preview at http://${host}:${port}\n`));
}
