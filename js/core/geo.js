// Pure location helpers shared by the browser and the server.
// Coordinates never leave the browser: the customer's position is used only
// to sort and label spots on their own device.
const EARTH_KM = 6371.0088;
const rad = deg => deg * Math.PI / 180;

// Loose South Africa + Lesotho/Eswatini bounding box, to reject typos and nonsense.
export const SA_BOUNDS = Object.freeze({minLat: -35.0, maxLat: -22.0, minLng: 16.0, maxLng: 33.0});

export function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= SA_BOUNDS.minLat && lat <= SA_BOUNDS.maxLat &&
    lng >= SA_BOUNDS.minLng && lng <= SA_BOUNDS.maxLng;
}

export function haversineKm(a, b) {
  if (!a || !b || !validCoords(a.lat, a.lng) || !validCoords(b.lat, b.lng)) return null;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const distanceTo = (origin, merchant) => haversineKm(origin, {lat: merchant?.lat, lng: merchant?.lng});

export function formatDistance(km) {
  if (km == null) return "";
  return km < 1 ? `${Math.max(50, Math.round(km * 10) * 100)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

// Parses admin/merchant input. Empty means "no coordinates"; anything else must be valid.
export function parseCoords(latInput, lngInput) {
  const blank = value => value === undefined || value === null || String(value).trim() === "";
  if (blank(latInput) && blank(lngInput)) return null;
  const lat = Number(latInput), lng = Number(lngInput);
  if (blank(latInput) || blank(lngInput) || !validCoords(lat, lng)) throw new Error("Enter valid South African coordinates, for example -25.9885 and 28.1280.");
  return {lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6};
}
