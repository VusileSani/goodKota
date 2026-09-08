/*
 * Yagoya Recommendation Foundation
 *
 * Discovery is geospatially bounded first. This service ranks only the nearby
 * candidate set. It never performs merchant discovery itself and therefore
 * cannot turn recommendation into an unbounded collection scan.
 *
 * Paid promotion is intentionally absent from this contract. A merchant can
 * buy advertising later, but cannot buy Yagoya Recommended status or score.
 */

const clamp01 = value => Math.max(0, Math.min(1, Number(value || 0)));

function qualityComponent(summary = {}) {
  const overall = Number(summary.recentOverall || summary.overall || 0);
  const food = Number(summary.recentFood || summary.food || overall || 0);
  if (!overall && !food) return 0;
  return clamp01(((food * 0.65) + (overall * 0.35) - 1) / 4);
}

function proximityComponent(distanceKm, radiusKm) {
  const distance = Math.max(0, Number(distanceKm || 0));
  const radius = Math.max(1, Number(radiusKm || 35));
  return clamp01(1 - (distance / radius));
}

function trendComponent(summary = {}) {
  const trend = Number(summary.recentTrend || 0);
  // ±1 star is enough to saturate the trend signal. Neutral trend = 0.5.
  return clamp01(0.5 + (trend / 2));
}

export function recommendationProfile(merchant, { radiusKm = 35 } = {}) {
  const summary = merchant.qualitySummary || {};
  const workflow = merchant.qualityWorkflow?.status || "healthy";
  const blocked = !merchant.enabled
    || merchant.commercial?.status === "suspended"
    || workflow === "suspended";
  const qualityConcern = ["intervention", "probation", "watch"].includes(workflow)
    || ["alert", "watch"].includes(summary.signal);

  const quality = qualityComponent(summary);
  const confidence = clamp01(summary.confidence ?? (Number(summary.count || 0) / (Number(summary.count || 0) + 8)));
  const consistency = clamp01(summary.consistency ?? (1 - Number(summary.lowRatingRate || 0)));
  const proximity = proximityComponent(merchant.distanceKm, radiusKm);
  const trend = trendComponent(summary);

  // Food quality dominates. Distance matters, but does not automatically win.
  const score = Math.round(100 * (
    quality * 0.48
    + confidence * 0.16
    + consistency * 0.16
    + trend * 0.08
    + proximity * 0.12
  ));

  let state = "not_enough_evidence";
  if (blocked || qualityConcern) state = "quality_concern";
  else if (
    Number(summary.count || 0) >= 5
    && Number(summary.overall || 0) >= 4.0
    && Number(summary.food || 0) >= 4.0
    && confidence >= 0.35
    && consistency >= 0.75
  ) state = "recommended";

  return Object.freeze({
    score,
    state,
    evidence: Object.freeze({
      verifiedRatings: Number(summary.count || 0),
      quality,
      confidence,
      consistency,
      trend,
      proximity
    })
  });
}

export function rankNearbyMerchants(merchants, { radiusKm = 35, limit = 30 } = {}) {
  return merchants
    .map(merchant => ({ ...merchant, recommendation: recommendationProfile(merchant, { radiusKm }) }))
    .sort((a, b) => {
      const scoreDiff = Number(b.recommendation.score || 0) - Number(a.recommendation.score || 0);
      if (scoreDiff) return scoreDiff;
      return Number(a.distanceKm || Infinity) - Number(b.distanceKm || Infinity);
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 30), 50)));
}
