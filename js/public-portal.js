import { AppStore } from "./core/store.js";
import { RepositoryHub } from "./repositories/repository-hub.js";
import { YagoyaCommandService } from "./services/command-service.js";
import { LocalMarketplacePaymentAdapter } from "./services/payment-service.js";
import { geocodeSouthAfricanAddress } from "./services/geocoding-service.js";
import { escapeHtml, money } from "./core/utils.js";

const store = new AppStore();
const repos = new RepositoryHub(store);
const commands = new YagoyaCommandService({
  store,
  paymentService: new LocalMarketplacePaymentAdapter(repos.platform.paymentGateway()),
  telemetry: { emit() {}, alert() {} }
});

function toast(message) {
  const box = document.querySelector("#publicToast");
  box.textContent = message;
  box.hidden = false;
  window.setTimeout(() => { box.hidden = true; }, 3600);
}

function renderPromotions() {
  const host = document.querySelector("#publicPromotions");
  const promos = repos.promotions.list({ status: "active", limit: 12 }).items;
  host.innerHTML = promos.length ? promos.map(item => `
    <article class="promotion-card"><span class="kicker">Yagoya offer</span><h3>${escapeHtml(item.code)}</h3><p>Save ${Number(item.discountPercent || 0)}%${Number(item.minCents || 0) ? ` when you spend ${money(item.minCents)} or more` : ""}.</p><a class="button secondary" href="./index.html">Order on Yagoya</a></article>`).join("") : '<article class="promotion-card"><h3>More coming soon.</h3><p>Current Yagoya promotions will appear here.</p></article>';
}

function renderSocial() {
  const host = document.querySelector("#socialLinks");
  const social = repos.platform.brand().social || {};
  const links = [["Instagram", social.instagram], ["Facebook", social.facebook], ["TikTok", social.tiktok]].filter(([, url]) => /^https?:\/\//i.test(String(url || "")));
  host.innerHTML = links.length ? links.map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join("") : '<span class="social-placeholder">Official channels will appear here once configured.</span>';
}

let resolvedMerchantLocation = null;
document.querySelector("#resolveMerchantAddress")?.addEventListener("click", async () => {
  const status = document.querySelector("#merchantLocationStatus");
  const button = document.querySelector("#resolveMerchantAddress");
  button.disabled = true;
  status.textContent = "Finding location…";
  try {
    resolvedMerchantLocation = await geocodeSouthAfricanAddress(document.querySelector("#merchantAddress").value);
    document.querySelector("#merchantLatitude").value = resolvedMerchantLocation.latitude;
    document.querySelector("#merchantLongitude").value = resolvedMerchantLocation.longitude;
    document.querySelector("#merchantArea").value = resolvedMerchantLocation.area;
    status.textContent = `${resolvedMerchantLocation.area || "Location found"} · ${resolvedMerchantLocation.latitude.toFixed(5)}, ${resolvedMerchantLocation.longitude.toFixed(5)}`;
  } catch (error) {
    resolvedMerchantLocation = null;
    status.textContent = error.message;
  } finally { button.disabled = false; }
});

document.querySelector("#merchantApplicationForm")?.addEventListener("submit", event => {
  event.preventDefault();
  try {
    commands.applyMerchant({
      businessName: document.querySelector("#merchantBusinessName").value,
      contactName: document.querySelector("#merchantContactName").value,
      email: document.querySelector("#merchantEmail").value,
      phone: document.querySelector("#merchantPhone").value,
      address: document.querySelector("#merchantAddress").value,
      area: resolvedMerchantLocation?.area || document.querySelector("#merchantArea").value,
      latitude: resolvedMerchantLocation?.latitude,
      longitude: resolvedMerchantLocation?.longitude,
      note: document.querySelector("#merchantNote").value
    });
    event.currentTarget.reset(); resolvedMerchantLocation = null;
    document.querySelector("#merchantLocationStatus").textContent = "Use the actual operating address.";
    toast("Merchant application sent to Yagoya.");
  } catch (error) { alert(error.message); }
});

document.querySelector("#driverApplicationForm")?.addEventListener("submit", event => {
  event.preventDefault();
  try {
    commands.applyDriver({
      name: document.querySelector("#driverName").value,
      phone: document.querySelector("#driverPhone").value,
      email: document.querySelector("#driverEmail").value,
      operatingArea: document.querySelector("#driverArea").value,
      vehicleType: document.querySelector("#driverVehicle").value,
      registration: document.querySelector("#driverRegistration").value,
      note: document.querySelector("#driverNote").value
    });
    event.currentTarget.reset(); toast("Driver application sent to Yagoya.");
  } catch (error) { alert(error.message); }
});

document.querySelector("#waitlistForm")?.addEventListener("submit", event => {
  event.preventDefault();
  try {
    commands.joinWaitlist({ name: document.querySelector("#waitlistName").value, email: document.querySelector("#waitlistEmail").value, area: document.querySelector("#waitlistArea").value });
    event.currentTarget.reset(); toast("You're on the Yagoya list.");
  } catch (error) { alert(error.message); }
});

renderPromotions();
renderSocial();
