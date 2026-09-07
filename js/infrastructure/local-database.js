const PREFIX = "yagoya_integrated_v6_2";
const LEGACY_SINGLE_KEYS = ["goodkota_foundation_v4", "goodkota_foundation_v5"];
const LEGACY_COLLECTION_PREFIXES = ["goodkota_integrated_v6_1", "goodkota_scale_v6"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCollectionPrefix(prefix, seed) {
  try {
    const manifest = JSON.parse(localStorage.getItem(`${prefix}:manifest`) || "null");
    if (!manifest?.collections?.length) return null;
    const state = {};
    for (const name of manifest.collections) {
      const raw = localStorage.getItem(`${prefix}:${name}`);
      state[name] = raw === null ? clone(seed[name]) : JSON.parse(raw);
    }
    return state;
  } catch {
    return null;
  }
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
    const current = loadCollectionPrefix(PREFIX, this.seed);
    if (current) {
      for (const [name, value] of Object.entries(current)) this.cache.set(name, JSON.stringify(value));
      return current;
    }

    for (const prefix of LEGACY_COLLECTION_PREFIXES) {
      const migrated = loadCollectionPrefix(prefix, this.seed);
      if (migrated) return migrated;
    }

    for (const legacyKey of LEGACY_SINGLE_KEYS) {
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
    localStorage.setItem(this.key("manifest"), JSON.stringify({ schemaVersion: "6.2", collections }));
  }

  clear() {
    const manifest = JSON.parse(localStorage.getItem(this.key("manifest")) || "null");
    (manifest?.collections || []).forEach(name => localStorage.removeItem(this.key(name)));
    localStorage.removeItem(this.key("manifest"));
    this.cache.clear();
  }
}
