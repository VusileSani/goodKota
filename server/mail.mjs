import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export function createVerificationMailer({apiKey = "",from = "",publicOrigin = "",devMail = false,dataDir,fetchImpl = fetch} = {}) {
  if (!publicOrigin && !devMail) return async () => { throw new Error("Email delivery is not configured."); };
  return async (email, token) => {
    const origin = publicOrigin || "http://127.0.0.1:8080";
    if (!/^https:\/\//.test(origin) && !devMail) throw new Error("Email delivery requires an HTTPS public origin.");
    const link = `${origin.replace(/\/$/,"")}/?verify=${encodeURIComponent(token)}`;
    if (devMail) {
      await mkdir(dataDir, {recursive:true,mode:0o700});
      await appendFile(join(dataDir,"dev-mail.ndjson"), `${JSON.stringify({to:email,link,at:new Date().toISOString()})}\n`, {mode:0o600});
      return;
    }
    if (!apiKey || !from) throw new Error("Email delivery is not configured.");
    let response;
    try {
      response = await fetchImpl("https://api.resend.com/emails", {
        method:"POST",
        headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({from,to:[email],subject:"Verify your GoodKota email",text:`Welcome to GoodKota. Open this link to verify your email (valid for 24 hours):\n\n${link}\n\nIf you did not create an account, you can ignore this message.`}),
        signal:AbortSignal.timeout(8000)
      });
    } catch { throw new Error("Email could not be sent. Try again later."); }
    if (!response.ok) throw new Error("Email could not be sent. Try again later.");
  };
}

export function createLinkMailer({apiKey = "",from = "",devMail = false,dataDir,fetchImpl = fetch} = {}) {
  return async (email, link) => {
    if (!/^https:\/\//.test(link)) throw new Error("Invalid verification link.");
    if (devMail) {
      await mkdir(dataDir,{recursive:true,mode:0o700});
      await appendFile(join(dataDir,"dev-mail.ndjson"),`${JSON.stringify({to:email,link,at:new Date().toISOString()})}\n`,{mode:0o600});
      return;
    }
    if (!apiKey || !from) throw new Error("Email delivery is not configured for resends.");
    let response;
    try {
      response = await fetchImpl("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject:"Verify your GoodKota email",text:`Open this link to verify your GoodKota email:\n\n${link}\n\nIf you did not request it, ignore this message.`}),signal:AbortSignal.timeout(8000)});
    } catch { throw new Error("Email could not be sent. Try again later."); }
    if (!response.ok) throw new Error("Email could not be sent. Try again later.");
  };
}
