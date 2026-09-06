export function money(cents) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(Number(cents || 0) / 100);
}

export function toCents(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100);
}

export function fromCents(cents) {
  return Number(cents || 0) / 100;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

export function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  const random = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pageResult(items, { limit = 25, cursor = null, sortBy = "createdAt", direction = "desc" } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const sorted = [...items].sort((a, b) => {
    const av = Number(a?.[sortBy] || 0);
    const bv = Number(b?.[sortBy] || 0);
    const byValue = direction === "asc" ? av - bv : bv - av;
    if (byValue) return byValue;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  const start = cursor ? Math.max(0, sorted.findIndex(item => item.id === cursor) + 1) : 0;
  const page = sorted.slice(start, start + safeLimit);
  return {
    items: page,
    nextCursor: start + safeLimit < sorted.length ? page.at(-1)?.id || null : null,
    hasMore: start + safeLimit < sorted.length
  };
}
