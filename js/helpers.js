export function money(value) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function statusTone(status) {
  const value = String(status || "").toUpperCase();
  if (["ACTIVE", "OPEN", "COMPLETED", "READY", "PILOT"].includes(value)) return "success";
  if (["PENDING", "PREPARING", "PAST_DUE"].includes(value)) return "warning";
  if (["ACCEPTED", "DISPATCHED"].includes(value)) return "info";
  if (["REJECTED", "CANCELLED", "SUSPENDED", "CLOSED"].includes(value)) return "danger";
  return "";
}

export function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
