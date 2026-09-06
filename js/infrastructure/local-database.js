const PREFIX = "goodkota_scale_v6";
const LEGACY_KEYS = ["goodkota_foundation_v4", "goodkota_foundation_v5"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class LocalCollectionDatabase {
  constructor(seed) {
    this.seed = clone(seed);
    this.cache = new Map();
  }

  key(name) {
    return `${PREFIX}:${name}`;
  }

  load() {
    const manifest = JSON.parse(localStorage.getItem(this.key("manifest")) || "null");
    if (manifest?.collections?.length) {
      const state = {};
      for (const name of manifest.collections) {
        const raw = localStorage.getItem(this.key(name));
        state[name] = raw === null ? clone(this.seed[name]) : JSON.parse(raw);
        this.cache.set(name, JSON.stringify(state[name]));
      }
      return state;
    }

    for (const legacyKey of LEGACY_KEYS) {
      try {
        const legacy = JSON.parse(localStorage.getItem(legacyKey) || "null");
        if (legacy) return legacy;
      } catch {
        // Continue to the next migration source.
      }
    }
    return clone(this.seed);
  }

  save(state) {
    const collections = Object.keys(state);
    for (const name of collections) {
      const serialized = JSON.stringify(state[name]);
      if (this.cache.get(name) === serialized) continue;
      localStorage.setItem(this.key(name), serialized);
      this.cache.set(name, serialized);
    }
    localStorage.setItem(this.key("manifest"), JSON.stringify({ schemaVersion: 6, collections }));
  }

  clear() {
    const manifest = JSON.parse(localStorage.getItem(this.key("manifest")) || "null");
    (manifest?.collections || []).forEach(name => localStorage.removeItem(this.key(name)));
    localStorage.removeItem(this.key("manifest"));
    this.cache.clear();
  }
}
