// The merchant supplies only an account identifier here. This browser prototype
// cannot verify account ownership or turn on online checkout.
export const PAYFAST_SIGNUP_URL = "https://payfast.io/gateway-aggregator-selector/";
export const PAYFAST_DASHBOARD_URL = "https://my.payfast.io/";

export const payfastAccount = merchant => merchant?.payfast || {
  status: "not_started", accountType: "", merchantId: "", reviewNote: ""
};

export function submitPayfastAccount(store, merchantId, fields) {
  const merchant = store.merchant(merchantId);
  if (!merchant) throw new Error("Merchant not found.");
  const accountType = String(fields.accountType || "").trim();
  const accountId = String(fields.merchantId || "").trim();
  if (!["individual", "business"].includes(accountType)) throw new Error("Choose your PayFast account type.");
  if (!/^\d{8}$/.test(accountId)) throw new Error("Enter the eight-digit PayFast Merchant ID.");
  if (store.state.merchants.some(item => item.id !== merchantId && payfastAccount(item).merchantId === accountId)) {
    throw new Error("That PayFast Merchant ID is already used by another spot.");
  }
  const current = payfastAccount(merchant);
  if (current.merchantId === accountId && current.accountType === accountType && current.status !== "needs_action") return current;
  merchant.payfast = {
    status: "submitted", accountType, merchantId: accountId,
    submittedAt: new Date().toISOString(), reviewedAt: null, reviewNote: ""
  };
  store.log("payfast_account_submitted", {merchantId});
  return merchant.payfast;
}

export function reviewPayfastAccount(store, merchantId, status, note) {
  const merchant = store.merchant(merchantId);
  if (!merchant || !payfastAccount(merchant).merchantId) throw new Error("No PayFast account submitted for this spot.");
  if (!["details_checked", "needs_action"].includes(status)) throw new Error("Choose a valid review decision.");
  const reviewNote = String(note || "").trim();
  if (!reviewNote) throw new Error("Add a review note for the merchant.");
  merchant.payfast.status = status;
  merchant.payfast.reviewNote = reviewNote;
  merchant.payfast.reviewedAt = new Date().toISOString();
  store.log("payfast_account_reviewed", {merchantId, status});
  return merchant.payfast;
}
