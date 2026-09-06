const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(latitude, longitude, precision = 7) {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let value = 0;
  let even = true;

  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const coordinate = even ? Number(longitude) : Number(latitude);
    const mid = (range[0] + range[1]) / 2;
    if (coordinate >= mid) {
      value = (value << 1) | 1;
      range[0] = mid;
    } else {
      value <<= 1;
      range[1] = mid;
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[value];
      bit = 0;
      value = 0;
    }
  }
  return hash;
}

export function boundingBox(origin, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngScale = Math.max(0.15, Math.cos(Number(origin.lat) * Math.PI / 180));
  const lngDelta = radiusKm / (111.32 * lngScale);
  return {
    minLat: Number(origin.lat) - latDelta,
    maxLat: Number(origin.lat) + latDelta,
    minLng: Number(origin.lng) - lngDelta,
    maxLng: Number(origin.lng) + lngDelta
  };
}
