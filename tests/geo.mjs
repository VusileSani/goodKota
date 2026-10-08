import assert from "node:assert/strict";
import { haversineKm, distanceTo, formatDistance, parseCoords, validCoords } from "../js/core/geo.js";
import { seed } from "../js/data/seed.js";

// Known distance: Johannesburg CBD to Pretoria CBD is roughly 54 km.
const jhb = {lat:-26.2041,lng:28.0473}, pta = {lat:-25.7479,lng:28.2293};
const km = haversineKm(jhb,pta);
assert.ok(km > 50 && km < 58, `JHB-PTA ${km}`);
assert.equal(haversineKm(jhb,jhb), 0);
assert.equal(haversineKm(jhb,{lat:null,lng:null}), null, "Missing coordinates give no distance");
assert.equal(haversineKm(jhb,{lat:51.5,lng:-0.12}), null, "Out-of-region coordinates are rejected");
assert.equal(validCoords(NaN,28), false);
assert.equal(formatDistance(0.3), "300 m");
assert.equal(formatDistance(1.44), "1.4 km");
assert.equal(formatDistance(12.6), "13 km");
assert.equal(formatDistance(null), "");
assert.equal(parseCoords("",""), null);
assert.deepEqual(parseCoords("-25.9885","28.1280"), {lat:-25.9885,lng:28.128});
assert.throws(() => parseCoords("-25.9",""));
assert.throws(() => parseCoords("abc","28"));
assert.throws(() => parseCoords("40","28"), /South African/);
// Every seeded spot has usable coordinates and ordering by distance from Midrand is sensible.
const midrand = {lat:-25.9960,lng:28.1280};
for (const m of seed.merchants) assert.ok(distanceTo(midrand,m) != null, `${m.name} has coordinates`);
const order = [...seed.merchants].sort((a,b) => distanceTo(midrand,a)-distanceTo(midrand,b)).map(m => m.id);
assert.equal(order[0],"m1");
assert.equal(order.at(-1),"m3");
console.log("Geo helpers passed.");
