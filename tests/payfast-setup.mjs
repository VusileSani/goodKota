import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoodKotaServer } from "../server/server.mjs";

const dataDir = await mkdtemp(join(tmpdir(), "goodkota-payfast-test-"));
const token = randomBytes(32).toString("hex");
const server = createGoodKotaServer({token, encryptionKey:randomBytes(32).toString("base64"), dataDir});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const auth = {Authorization:`Bearer ${token}`};

try {
  assert.equal((await fetch(`${base}/api/admin/payfast/capabilities`)).status, 200);
  assert.equal((await fetch(`${base}/api/admin/payfast/status`)).status, 401);
  const status = await (await fetch(`${base}/api/admin/payfast/status?storeId=m1`, {headers:auth})).json();
  assert.equal(status.configured, false);
  const response = await fetch(`${base}/api/admin/payfast/config`, {method:"POST", headers:{...auth,"Content-Type":"application/json"}, body:JSON.stringify({storeId:"m1",environment:"sandbox",merchantId:"12345678",merchantKey:"secretKey123",passphrase:"a-sandbox-secret"})});
  assert.equal(response.status, 200);
  const saved = await (await fetch(`${base}/api/admin/payfast/status?storeId=m1`, {headers:auth})).json();
  assert.deepEqual([saved.configured, saved.merchantIdMasked, saved.checkoutActive], [true,"••••5678",false]);
  assert.equal(JSON.stringify(saved).includes("secretKey123"), false);
  assert.equal((await (await fetch(`${base}/api/admin/payfast/status?storeId=m2`, {headers:auth})).json()).configured, false);
  const filename = join(dataDir, "payfast-m1.enc.json");
  assert.equal((await readFile(filename, "utf8")).includes("secretKey123"), false);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal((await fetch(`${base}/api/admin/payfast/config`, {method:"POST", headers:{...auth,"Content-Type":"application/json",Origin:"https://other.example"}, body:"{}"})).status, 403);
  assert.equal((await fetch(`${base}/server/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/index.html`)).status, 200);
  assert.equal((await fetch(`${base}/api/admin/payfast/config?storeId=m1`, {method:"DELETE",headers:auth})).status, 200);
  assert.equal((await (await fetch(`${base}/api/admin/payfast/status?storeId=m1`, {headers:auth})).json()).configured, false);
  console.log("Secure PayFast setup API passed.");
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(dataDir, {recursive:true, force:true});
}
