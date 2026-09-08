import { localAreaSuggestions, normalizeLocation } from "./location-service.js";

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 50;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.value;
}
function cacheSet(key, value) {
  cache.set(key, { value, savedAt: Date.now() });
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function normalizeProviderPlace(place) {
  return normalizeLocation({
    lat: place.lat ?? place.latitude,
    lng: place.lng ?? place.longitude,
    label: place.label || place.display_name || place.address,
    type: place.type || place.placeType || "location",
    source: place.source || "location_provider",
    providerRef: place.providerRef || place.place_id || place.id || null
  });
}

// Production autocomplete must be mediated by a Yagoya backend endpoint. This keeps
// provider credentials off the client, allows rate limiting/caching, and prevents the UI
// from coupling itself to Google/Mapbox/HERE response formats. Set this at deployment time.
function autocompleteEndpoint() {
  const value = globalThis.YAGOYA_LOCATION_AUTOCOMPLETE_ENDPOINT || globalThis.GOODKOTA_LOCATION_AUTOCOMPLETE_ENDPOINT;
  return typeof value === "string" && value.startsWith("/") ? value : null;
}

export async function suggestSouthAfricanLocations(query, { limit = 6, signal } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 6, 8));
  const key = `suggest:${q.toLowerCase()}:${boundedLimit}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const fallback = localAreaSuggestions(q, boundedLimit);
  const endpoint = autocompleteEndpoint();
  if (!endpoint || q.length < 3) { cacheSet(key, fallback); return fallback; }

  try {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("q", q);
    url.searchParams.set("country", "ZA");
    url.searchParams.set("limit", String(boundedLimit));
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("autocomplete unavailable");
    const payload = await response.json();
    const source = Array.isArray(payload) ? payload : payload.items;
    const items = (Array.isArray(source) ? source : []).map(normalizeProviderPlace).slice(0, boundedLimit);
    const result = items.length ? items : fallback;
    cacheSet(key, result);
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    cacheSet(key, fallback);
    return fallback;
  }
}

export async function geocodeSouthAfricanAddress(address) {
  const query = String(address || "").trim();
  if (!query) throw new Error("Enter a street address first.");
  const key = `geocode:${query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // One-shot geocoding remains isolated here for the prototype. Production should route
  // this operation through the same server-side provider adapter used for autocomplete.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "za");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);

  let response;
  try { response = await fetch(url, { headers: { "Accept-Language": "en-ZA,en" } }); }
  catch { throw new Error("Address lookup is unavailable right now. Enter latitude and longitude manually."); }
  if (!response.ok) throw new Error("Address lookup could not be completed. Enter coordinates manually if needed.");
  const results = await response.json();
  const match = results[0];
  if (!match) throw new Error("That address could not be located. Refine it or enter coordinates manually.");
  const a = match.address || {};
  const value = {
    address: match.display_name || query,
    area: a.suburb || a.town || a.city || a.village || a.county || "",
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    placeType: match.type || "address",
    providerRef: match.place_id || null
  };
  cacheSet(key, value);
  return value;
}
