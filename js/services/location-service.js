const AREA_CENTRES = {
  midrand: { lat: -25.9992, lng: 28.1263, label: "Midrand" },
  tembisa: { lat: -25.9964, lng: 28.2268, label: "Tembisa" },
  centurion: { lat: -25.8603, lng: 28.1894, label: "Centurion" },
  "ivory park": { lat: -25.9869, lng: 28.1974, label: "Ivory Park" },
  johannesburg: { lat: -26.2041, lng: 28.0473, label: "Johannesburg" },
  pretoria: { lat: -25.7479, lng: 28.2293, label: "Pretoria" },
  soweto: { lat: -26.2485, lng: 27.8540, label: "Soweto" },
  vereeniging: { lat: -26.6731, lng: 27.9261, label: "Vereeniging" }
};

function toRadians(value) {
  return value * Math.PI / 180;
}

export function distanceKm(a, b) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function rankMerchantsByDistance(merchants, origin) {
  return merchants
    .filter(merchant => merchant.enabled && merchant.qualityWorkflow.status !== "suspended")
    .filter(merchant => Number.isFinite(Number(merchant.latitude)) && Number.isFinite(Number(merchant.longitude)))
    .map(merchant => ({
      ...merchant,
      distanceKm: distanceKm(origin, { lat: Number(merchant.latitude), lng: Number(merchant.longitude) })
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function getCurrentPosition() {
  if (!navigator.geolocation) {
    throw new Error("Location services are not available in this browser.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label: "Your current location",
        source: "gps"
      }),
      error => reject(new Error(error.message || "Location permission was not granted.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  });
}

export function resolveArea(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return null;

  const exact = AREA_CENTRES[normalized];
  if (exact) return { ...exact, source: "area" };

  const key = Object.keys(AREA_CENTRES).find(area => area.includes(normalized) || normalized.includes(area));
  return key ? { ...AREA_CENTRES[key], source: "area" } : null;
}

export function defaultLocation() {
  return { ...AREA_CENTRES.midrand, source: "demo-default" };
}
