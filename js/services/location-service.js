const AREA_CENTRES = {
  midrand: { lat: -25.9992, lng: 28.1263, label: "Midrand", type: "town" },
  tembisa: { lat: -25.9964, lng: 28.2268, label: "Tembisa", type: "township" },
  centurion: { lat: -25.8603, lng: 28.1894, label: "Centurion", type: "town" },
  "ivory park": { lat: -25.9869, lng: 28.1974, label: "Ivory Park", type: "township" },
  johannesburg: { lat: -26.2041, lng: 28.0473, label: "Johannesburg", type: "city" },
  pretoria: { lat: -25.7479, lng: 28.2293, label: "Pretoria", type: "city" },
  soweto: { lat: -26.2485, lng: 27.8540, label: "Soweto", type: "township" },
  vereeniging: { lat: -26.6731, lng: 27.9261, label: "Vereeniging", type: "town" }
};

const VALID_LAT = value => Number.isFinite(Number(value)) && Number(value) >= -90 && Number(value) <= 90;
const VALID_LNG = value => Number.isFinite(Number(value)) && Number(value) >= -180 && Number(value) <= 180;

function toRadians(value) { return value * Math.PI / 180; }

export function isValidCoordinates(value) {
  return Boolean(value) && VALID_LAT(value.lat ?? value.latitude) && VALID_LNG(value.lng ?? value.longitude);
}

export function normalizeLocation(value, fallbackLabel = "Selected location") {
  if (!isValidCoordinates(value)) throw new Error("Valid location coordinates are required.");
  return {
    lat: Number(value.lat ?? value.latitude),
    lng: Number(value.lng ?? value.longitude),
    label: String(value.label || value.address || fallbackLabel).trim() || fallbackLabel,
    type: value.type || "location",
    source: value.source || "unknown",
    providerRef: value.providerRef || null
  };
}

export function distanceKm(a, b) {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return Number.POSITIVE_INFINITY;
  const first = normalizeLocation(a);
  const second = normalizeLocation(b);
  const earthRadiusKm = 6371;
  const dLat = toRadians(second.lat - first.lat);
  const dLng = toRadians(second.lng - first.lng);
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function getCurrentPosition() {
  if (!navigator.geolocation) throw new Error("Location services are not available in this browser.");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve(normalizeLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label: "Your current location",
        type: "current_location",
        source: "device"
      })),
      error => reject(new Error(error.message || "Location permission was not granted.")),
      // Discovery does not require continuous or survey-grade GPS. Reuse a recent fix to
      // reduce battery use and startup latency; merchant navigation uses stored coordinates.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

export function resolveArea(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return null;
  const exact = AREA_CENTRES[normalized];
  if (exact) return normalizeLocation({ ...exact, source: "local_gazetteer" });
  const key = Object.keys(AREA_CENTRES).find(area => area.includes(normalized) || normalized.includes(area));
  return key ? normalizeLocation({ ...AREA_CENTRES[key], source: "local_gazetteer" }) : null;
}

export function localAreaSuggestions(query, limit = 6) {
  const normalized = String(query || "").trim().toLowerCase();
  if (normalized.length < 2) return [];
  return Object.values(AREA_CENTRES)
    .filter(item => item.label.toLowerCase().includes(normalized))
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 8)))
    .map(item => normalizeLocation({ ...item, source: "local_gazetteer" }));
}

export function directionsUrl(destination, { label = "" } = {}) {
  const location = normalizeLocation(destination, label || "Merchant");
  const coords = `${location.lat},${location.lng}`;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
  if (isApple) return `https://maps.apple.com/?daddr=${encodeURIComponent(coords)}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}&travelmode=driving`;
}

export function defaultLocation() {
  return normalizeLocation({ ...AREA_CENTRES.midrand, source: "demo_default" });
}
