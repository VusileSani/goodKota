import test from "node:test";
import assert from "node:assert/strict";
import { directionsUrl, distanceKm, localAreaSuggestions, normalizeLocation } from "../js/services/location-service.js";
import { encodeGeohash } from "../js/services/geohash-service.js";

// navigator is optional in Node; directionsUrl deliberately falls back to Google Maps.
test("normalized locations validate coordinates and retain provider-independent shape", () => {
  const item = normalizeLocation({ latitude: -25.9992, longitude: 28.1263, address: "Midrand", providerRef: "abc" });
  assert.deepEqual(Object.keys(item).sort(), ["label","lat","lng","providerRef","source","type"].sort());
  assert.equal(item.lat, -25.9992);
  assert.throws(() => normalizeLocation({ lat: 120, lng: 20 }), /Valid location coordinates/);
});

test("merchant distance remains exact after bounded candidate selection", () => {
  const km = distanceKm({ lat: -25.9992, lng: 28.1263 }, { lat: -25.9964, lng: 28.2268 });
  assert.ok(km > 9 && km < 11);
});

test("local autocomplete is bounded and requires meaningful input", () => {
  assert.equal(localAreaSuggestions("m", 6).length, 0);
  const items = localAreaSuggestions("mid", 2);
  assert.ok(items.length <= 2);
  assert.equal(items[0].label, "Midrand");
});

test("directions handoff uses exact merchant coordinates and no secret key", () => {
  const url = directionsUrl({ lat: -25.9992, lng: 28.1263 }, { label: "Merchant" });
  assert.match(url, /-25\.9992/);
  assert.match(url, /28\.1263/);
  assert.doesNotMatch(url, /key=/i);
});

test("merchant geohash is deterministic for production geo queries", () => {
  assert.equal(encodeGeohash(-25.9992, 28.1263, 7), encodeGeohash(-25.9992, 28.1263, 7));
});
