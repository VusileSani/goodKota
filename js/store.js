import { STORAGE_KEY } from "./config.js";
import { demoData } from "./demoData.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(demoData);
    const parsed = JSON.parse(raw);
    if (parsed?.meta?.schemaVersion !== demoData.meta.schemaVersion) return clone(demoData);
    return parsed;
  } catch {
    return clone(demoData);
  }
}

let state = loadInitialState();
const listeners = new Set();

export function getState() {
  return state;
}

export function updateState(mutator) {
  const draft = clone(state);
  mutator(draft);
  state = draft;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach(listener => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetState() {
  state = clone(demoData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach(listener => listener(state));
}
