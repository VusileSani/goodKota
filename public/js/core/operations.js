export const CHECK_IDS = ["local", "kota", "consistency", "value", "readiness"];
export const ORDER_NEXT = {
  new: ["accepted", "cancelled"],
  accepted: ["ready", "cancelled"],
  ready: ["completed"],
  completed: [],
  cancelled: []
};

const clean = value => String(value ?? "").trim();
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const required = (value, label) => {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
};

export function isPick(merchant) {
  return CHECK_IDS.every(key => merchant.standard?.[key] === true);
}

export function canOrder(merchant) {
  return merchant?.listingStatus === "active" && merchant.online === true;
}

export function submitApplication(store, fields) {
  const application = {
    id: id("application"),
    businessName: required(fields.businessName, "Trading name"),
    contactName: required(fields.contactName, "Contact name"),
    phone: required(fields.phone, "Phone number"),
    email: required(fields.email, "Email"),
    area: required(fields.area, "Area"),
    address: required(fields.address, "Pickup address"),
    note: clean(fields.note),
    status: "new",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewReason: "",
    merchantId: null
  };
  store.state.applications.unshift(application);
  store.log("application_submitted", { applicationId: application.id });
  return application;
}

export function reviewApplication(store, applicationId, decision, fields, reason = "") {
  const application = store.state.applications.find(item => item.id === applicationId);
  if (!application || !["new", "review"].includes(application.status)) throw new Error("This application has already been handled.");
  if (decision === "review") {
    application.status = "review";
  } else if (decision === "declined") {
    application.reviewReason = required(reason, "Reason");
    application.status = "declined";
  } else if (decision === "approved") {
    const name = required(fields.businessName, "Trading name");
    const address = required(fields.address, "Pickup address");
    const area = required(fields.area, "Area");
    if (store.state.merchants.some(m => m.name.toLowerCase() === name.toLowerCase())) throw new Error("A merchant with this name already exists.");
    const merchant = {
      id: id("merchant"), name, area, address,
      contact: { name: required(fields.contactName, "Contact name"), phone: required(fields.phone, "Phone number"), email: required(fields.email, "Email") },
      prepMinutes: 20, listingStatus: "review", online: false, menu: [],
      standard: Object.fromEntries(CHECK_IDS.map(key => [key, false])),
      quality: { status: "healthy", note: "" },
      payfast: { status: "not_started", accountType: "", merchantId: "", reviewNote: "" },
      note: "", tags: [], distanceKm: null
    };
    store.state.merchants.push(merchant);
    Object.assign(application, { businessName: name, area, address,
      contactName: merchant.contact.name, phone: merchant.contact.phone, email: merchant.contact.email, note: clean(fields.note) });
    application.status = "approved";
    application.merchantId = merchant.id;
  } else throw new Error("Unknown application decision.");
  application.reviewedAt = new Date().toISOString();
  if (reason) application.reviewReason = clean(reason);
  store.log("application_reviewed", { applicationId, decision, merchantId: application.merchantId });
  return application;
}

export function saveMerchant(store, merchantId, fields) {
  const merchant = store.merchant(merchantId);
  if (!merchant) throw new Error("Merchant not found.");
  const name = required(fields.name, "Trading name");
  if (store.state.merchants.some(m => m.id !== merchantId && m.name.toLowerCase() === name.toLowerCase())) throw new Error("A merchant with this name already exists.");
  const prepMinutes = Number(fields.prepMinutes);
  if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 180) throw new Error("Prep time must be between 1 and 180 minutes.");
  Object.assign(merchant, {
    name, area: required(fields.area, "Area"), address: required(fields.address, "Pickup address"), prepMinutes,
    contact: { name: clean(fields.contactName), phone: clean(fields.phone), email: clean(fields.email) }
  });
  store.log("merchant_updated", { merchantId });
  return merchant;
}

export function reviewMerchant(store, merchantId, checks, reason) {
  const merchant = store.merchant(merchantId);
  if (!merchant) throw new Error("Merchant not found.");
  const note = required(reason, "Review note");
  merchant.standard = Object.fromEntries(CHECK_IDS.map(key => [key, checks[key] === true]));
  merchant.reviewNote = note;
  if (!isPick(merchant) && merchant.listingStatus === "active") {
    merchant.listingStatus = "review";
    merchant.online = false;
  }
  store.log("merchant_standard_reviewed", { merchantId, checks: merchant.standard, reason: note });
}

export function setMerchantStatus(store, merchantId, status, reason) {
  const merchant = store.merchant(merchantId);
  if (!merchant || !["active", "review", "paused"].includes(status)) throw new Error("Invalid merchant status.");
  const note = required(reason, "Reason");
  if (status === "active" && (!isPick(merchant) || !merchant.address || !merchant.menu.some(item => item.available) || merchant.quality?.status === "intervention")) {
    throw new Error("Finish the quality checks, pickup address and menu, and clear any quality intervention before activating.");
  }
  merchant.listingStatus = status;
  if (status !== "active") merchant.online = false;
  merchant.statusReason = note;
  store.log("merchant_status_changed", { merchantId, status, reason: note });
}

export function setQuality(store, merchantId, status, reason) {
  const merchant = store.merchant(merchantId);
  if (!merchant || !["healthy", "watch", "intervention"].includes(status)) throw new Error("Invalid quality status.");
  merchant.quality = { status, note: required(reason, "Reason"), updatedAt: new Date().toISOString() };
  if (status === "intervention") { merchant.listingStatus = "paused"; merchant.online = false; }
  store.log("merchant_quality_changed", { merchantId, status, reason: merchant.quality.note });
}

export function transitionOrder(store, orderId, next, reason = "") {
  const order = store.state.orders.find(item => item.id === orderId);
  if (!order || !ORDER_NEXT[order.status]?.includes(next)) throw new Error("This order cannot move to that status.");
  if (next === "cancelled") order.cancelReason = required(reason, "Cancellation reason");
  order.status = next;
  order.updatedAt = new Date().toISOString();
  store.log("order_status_changed", { orderId, status: next, reason: order.cancelReason || "" });
  return order;
}

// An operational record only. A refund must be performed and verified through
// the actual payment method; this never changes the order's payment status.
export function requestRefundReview(store, merchantId, orderId, fields) {
  const order = store.state.orders.find(item => item.id === orderId && item.merchantId === merchantId);
  if (!order || !["completed", "cancelled"].includes(order.status)) throw new Error("Only a previous order from this spot can be reviewed for a refund.");
  if (order.refundReview && order.refundReview.status !== "needs_info") throw new Error("This order already has a refund review.");
  if (!Number.isSafeInteger(order.total) || order.total <= 0) throw new Error("This order has no valid amount to review.");
  const reason = required(fields.reason, "Refund reason");
  if (reason.length > 500) throw new Error("Keep the refund reason under 500 characters.");
  const paymentMethod = clean(fields.paymentMethod);
  if (!["cash", "card", "eft", "other"].includes(paymentMethod)) throw new Error("Choose how the customer paid.");
  const paymentReference = clean(fields.paymentReference);
  if (paymentReference.length > 100) throw new Error("Keep the payment reference under 100 characters.");
  const now = new Date().toISOString();
  const history = order.refundReview?.history || [];
  order.refundReview = {
    requestedAt: order.refundReview?.requestedAt || now,
    updatedAt: now, status: "requested", amount: order.total,
    reason, paymentMethod, paymentReference, adminNote: "", outcome: "", externalReference: "",
    history: [...history, {at: now, actor: "merchant", action: history.length ? "resubmitted" : "requested", note: reason}]
  };
  store.log("refund_review_requested", {orderId, merchantId, amount: order.total, paymentMethod});
  return order.refundReview;
}

export function reviewRefundRequest(store, orderId, decision, note, outcome = "", externalReference = "") {
  const order = store.state.orders.find(item => item.id === orderId);
  const request = order?.refundReview;
  if (!request || request.status !== "requested" || !["needs_info", "resolved"].includes(decision)) throw new Error("This refund request is not awaiting review.");
  const adminNote = required(note, "Review note");
  if (adminNote.length > 500) throw new Error("Keep the review note under 500 characters.");
  const reference = clean(externalReference);
  if (decision === "resolved") {
    if (!["handled_externally", "not_due"].includes(outcome)) throw new Error("Choose a manual outcome.");
    if (outcome === "handled_externally" && !reference) throw new Error("Enter a receipt or transaction reference for the external refund.");
    if (reference.length > 100) throw new Error("Keep the external reference under 100 characters.");
  }
  const now = new Date().toISOString();
  Object.assign(request, {status: decision, adminNote, outcome: decision === "resolved" ? outcome : "", externalReference: decision === "resolved" ? reference : "", updatedAt: now,
    history: [...(request.history || []), {at: now, actor: "goodkota", action: decision, note: adminNote, outcome: decision === "resolved" ? outcome : ""}]});
  store.log("refund_review_updated", {orderId, merchantId: order.merchantId, status: decision, outcome: request.outcome});
  return request;
}

export function createCase(store, merchantId, subject, message) {
  if (!store.merchant(merchantId)) throw new Error("Merchant not found.");
  const item = { id: id("case"), merchantId, subject: required(subject, "Subject"), message: required(message, "Message"), status: "open", note: "", updatedAt: new Date().toISOString() };
  store.state.supportCases.unshift(item);
  store.log("support_case_opened", { caseId: item.id, merchantId });
  return item;
}

export function updateCase(store, caseId, status, note) {
  const item = store.state.supportCases.find(entry => entry.id === caseId);
  if (!item || !["open", "in_progress", "resolved"].includes(status)) throw new Error("Invalid case status.");
  item.note = required(note, "Handover note");
  item.status = status;
  item.updatedAt = new Date().toISOString();
  store.log("support_case_updated", { caseId, status, note: item.note });
}

export function orderReport(state, { from, to, merchantId = "" }) {
  if (!from || !to || from > to) throw new Error("Choose a valid date range.");
  const orders = state.orders.filter(order => {
    const date = (order.createdIso || "").slice(0, 10);
    return date >= from && date <= to && (!merchantId || order.merchantId === merchantId);
  });
  const active = orders.filter(order => order.status !== "cancelled");
  return { orders, count: active.length, cancelled: orders.length - active.length, orderValue: active.reduce((sum, order) => sum + order.total, 0) };
}
