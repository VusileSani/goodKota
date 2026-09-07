export function merchantStorefrontUrl(merchantId, baseHref = globalThis.location?.href || "https://goodkota.co.za/") {
  const url = new URL("./index.html", baseHref);
  url.search = "";
  url.hash = "";
  url.searchParams.set("merchant", merchantId);
  return url.toString();
}

export function qrImageUrl(value, size = 280) {
  const safeSize = Math.max(160, Math.min(640, Number(size) || 280));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&margin=8&data=${encodeURIComponent(value)}`;
}
