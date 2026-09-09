import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NAVIGATION_PREFERENCE_KEY,
  directionsUrl,
  navigationProviders,
  getPreferredNavigationProvider,
  setPreferredNavigationProvider,
  clearPreferredNavigationProvider
} from "../js/services/location-service.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const merchant = { lat: -25.9992, lng: 28.1263 };

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

test("navigation providers are explicit and provider-neutral", () => {
  assert.deepEqual(navigationProviders().map(item => item.id), ["waze", "google", "apple"]);
});

test("Waze handoff uses exact merchant coordinates", () => {
  const url = directionsUrl(merchant, { provider: "waze", label: "Merchant" });
  assert.match(url, /^https:\/\/www\.waze\.com\/ul\?/);
  assert.match(url, /-25\.9992/);
  assert.match(url, /28\.1263/);
  assert.match(url, /navigate=yes/);
  assert.doesNotMatch(url, /key=/i);
});

test("Google and Apple navigation links remain available", () => {
  const google = directionsUrl(merchant, { provider: "google" });
  const apple = directionsUrl(merchant, { provider: "apple" });
  assert.match(google, /google\.com\/maps\/dir/);
  assert.match(apple, /maps\.apple\.com/);
  for (const url of [google, apple]) {
    assert.match(url, /-25\.9992/);
    assert.match(url, /28\.1263/);
    assert.doesNotMatch(url, /key=/i);
  }
});

test("remembered navigation preference is bounded and removable", () => {
  const storage = memoryStorage();
  assert.equal(getPreferredNavigationProvider(storage), null);
  assert.equal(setPreferredNavigationProvider("waze", storage), true);
  assert.equal(storage.getItem(NAVIGATION_PREFERENCE_KEY), "waze");
  assert.equal(getPreferredNavigationProvider(storage), "waze");
  assert.equal(setPreferredNavigationProvider("invalid", storage), false);
  assert.equal(clearPreferredNavigationProvider(storage), true);
  assert.equal(getPreferredNavigationProvider(storage), null);
});

test("customer Directions button stays beside merchant location and opens chooser", () => {
  const view = read("js/views/customer-view.js");
  const css = read("css/styles.css");
  assert.match(view, /customer-store-location[\s\S]*data-merchant-directions/);
  assert.match(view, /customer-directions-button/);
  assert.match(view, /openNavigationChooser/);
  assert.match(view, /Waze|navigationProviders/);
  assert.match(view, /Google Maps|navigationProviders/);
  assert.match(view, /Apple Maps|navigationProviders/);
  assert.match(css, /\.customer-directions-button/);
  assert.match(css, /\.navigation-provider-list/);
});

test("installed build cache is bumped for navigation behavior", () => {
  assert.match(read("service-worker.js"), /yagoya-v6-11-navigation-app-choice-shell/);
});
