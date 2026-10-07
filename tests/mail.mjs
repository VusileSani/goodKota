import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVerificationMailer } from "../server/mail.mjs";

const dataDir = await mkdtemp(join(tmpdir(),"goodkota-mail-test-"));
try {
  const mail = createVerificationMailer({devMail:true,dataDir,publicOrigin:"http://127.0.0.1:8080"});
  await mail("nandi@example.test","a".repeat(64));
  const record = JSON.parse((await readFile(join(dataDir,"dev-mail.ndjson"),"utf8")).trim());
  assert.equal(record.to,"nandi@example.test");
  assert.equal(new URL(record.link).searchParams.get("verify"),"a".repeat(64));
  let request;
  const hosted = createVerificationMailer({apiKey:"private-key",from:"GoodKota <hello@example.test>",publicOrigin:"https://goodkota.example",fetchImpl:async (url,options) => { request = {url,options}; return {ok:true}; }});
  await hosted("nandi@example.test","b".repeat(64));
  assert.equal(request.url,"https://api.resend.com/emails");
  assert.equal(request.options.headers.Authorization,"Bearer private-key");
  const body = JSON.parse(request.options.body);
  assert.equal(body.to[0],"nandi@example.test");
  assert(body.text.includes("https://goodkota.example/?verify="));
  console.log("Verification email delivery adapters passed.");
} finally { await rm(dataDir,{recursive:true,force:true}); }
