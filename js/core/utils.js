export function money(value) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
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
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
