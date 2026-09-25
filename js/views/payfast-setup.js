const endpoint = "./api/admin/payfast";

export async function mountPayfastSetup(container, {esc, showToast, merchants}) {
  if (!container) return;
  container.innerHTML = `<section class="panel"><h2>Checking secure setup…</h2></section>`;
  let capability;
  try {
    const response = await fetch(`${endpoint}/capabilities`, {cache:"no-store", credentials:"omit"});
    if (!response.ok) throw new Error("Unavailable");
    capability = await response.json();
  } catch { /* Static hosting has no credential service. */ }
  if (!capability?.secureSetup) {
    container.innerHTML = `<section class="panel payment-setup"><h2>Secure setup unavailable here</h2><p>This static preview can take pay-on-collection orders. To add PayFast credentials, run the secure GoodKota server and open its management workspace. Online checkout stays off until payment verification is built and tested.</p></section>`;
    return;
  }
  if (!merchants.length) { container.innerHTML = `<section class="panel payment-setup"><h2>No merchant yet</h2><p>Approve a merchant before configuring its PayFast account.</p></section>`; return; }

  let accessCode = "";
  let selectedStoreId = merchants[0].id;
  const picker = () => `<label>GoodKota merchant<select id="payfastStore" aria-label="Select merchant for PayFast setup">${merchants.map(m => `<option value="${esc(m.id)}" ${m.id === selectedStoreId ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>`;
  const statusPath = () => `status?storeId=${encodeURIComponent(selectedStoreId)}`;
  const bindPicker = () => container.querySelector("#payfastStore").addEventListener("change", async event => {
    selectedStoreId = event.target.value;
    if (!accessCode) return;
    const selected = selectedStoreId;
    try { const status = await request(statusPath()); if (selected === selectedStoreId) show(status); } catch (error) { showToast(error.message); }
  });
  const request = async (path, options = {}) => {
    const response = await fetch(`${endpoint}/${path}`, {
      cache:"no-store", credentials:"omit", ...options,
      headers:{Authorization:`Bearer ${accessCode}`, ...(options.body ? {"Content-Type":"application/json"} : {})}
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Setup request failed.");
    return data;
  };
  const unlock = () => {
    container.innerHTML = `<section class="panel payment-setup"><div class="eyebrow">PayFast</div><h2>Unlock payment setup</h2><p>Configure a separate provider account for each approved merchant. PayFast calls these credentials Merchant ID, Merchant Key and an optional Security Passphrase.</p><div class="editor-form">${picker()}</div><form id="unlockPayfast" class="editor-form"><label>GoodKota setup access code<input name="code" type="password" autocomplete="off" required></label><button class="btn primary" type="submit">Unlock</button></form></section>`;
    bindPicker();
    container.querySelector("#unlockPayfast").addEventListener("submit", async event => {
      event.preventDefault();
      accessCode = new FormData(event.currentTarget).get("code");
      event.currentTarget.reset();
      try { const status = await request(statusPath()); show(status); }
      catch (error) { accessCode = ""; showToast(error.message); }
    });
  };
  const show = status => {
    container.innerHTML = `<section class="panel payment-setup"><div class="eyebrow">Payment provider</div><h2>PayFast setup</h2>
      <div class="editor-form">${picker()}</div>
      <p>${status.configured ? `Credentials stored for <strong>${esc(status.merchantIdMasked)}</strong> (${esc(status.environment)}).` : "No credentials saved yet."} Online checkout is still disabled until a trusted order service and verified payment notifications are deployed.</p>
      <form id="payfastCredentials" class="editor-form"><label>Environment<select name="environment"><option value="sandbox" ${status.environment === "sandbox" ? "selected" : ""}>Sandbox</option><option value="live" ${status.environment === "live" ? "selected" : ""}>Live</option></select></label><label>Merchant ID<input name="merchantId" inputmode="numeric" pattern="[0-9]{6,12}" autocomplete="off" required></label><label>Merchant Key<input name="merchantKey" type="password" autocomplete="off" minlength="8" maxlength="64" required></label><label>Security Passphrase (if enabled)<input name="passphrase" type="password" autocomplete="off" maxlength="32"></label><div class="action-row"><button class="btn primary" type="submit">${status.configured ? "Replace credentials" : "Save credentials"}</button>${status.configured ? `<button class="btn ghost" type="button" id="removePayfast">Remove credentials</button>` : ""}</div></form>
      <p class="muted">Credentials go only to the secure server and never enter browser storage. Entering them does not switch on online payments.</p></section>`;
    bindPicker();
    container.querySelector("#payfastCredentials").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const fields = Object.fromEntries(new FormData(form));
      const selected = selectedStoreId;
      form.reset();
      try {
        await request("config", {method:"POST", body:JSON.stringify({...fields, storeId:selected})});
        if (selected === selectedStoreId) show(await request(statusPath()));
        showToast("PayFast credentials saved securely");
      } catch (error) { showToast(error.message); }
    });
    container.querySelector("#removePayfast")?.addEventListener("click", async () => {
      if (!window.confirm("Remove saved PayFast credentials?")) return;
      const selected = selectedStoreId;
      try { await request(`config?storeId=${encodeURIComponent(selected)}`, {method:"DELETE"}); if (selected === selectedStoreId) show(await request(statusPath())); showToast("PayFast credentials removed"); }
      catch (error) { showToast(error.message); }
    });
  };
  unlock();
}
