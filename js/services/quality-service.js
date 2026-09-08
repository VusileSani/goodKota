import { average } from "../core/utils.js";

export const QUALITY_THRESHOLDS = Object.freeze({
  minimumRatings: 10,
  recommendationMinimumRatings: 5,
  recommendationAverage: 4.0,
  alertAverage: 3.5,
  watchAverage: 3.8,
  recentPoorCount: 3,
  recentWindow: 5,
  alertLowRatingRate: 0.30,
  watchLowRatingRate: 0.20
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function recentSlice(ratings, size = 5) {
  return [...ratings]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, size);
}

export function summariseRatings(ratings) {
  const verified = ratings.filter(rating => rating.verified);
  const lowRatings = verified.filter(rating => rating.overall <= 2);
  const recent = recentSlice(verified, QUALITY_THRESHOLDS.recentWindow);
  const prior = [...verified]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(5, 10);

  const overall = average(verified.map(rating => rating.overall));
  const recentOverall = average(recent.map(rating => rating.overall));
  const priorOverall = average(prior.map(rating => rating.overall));
  const lowRatingRate = verified.length ? lowRatings.length / verified.length : 0;
  const confidence = verified.length ? verified.length / (verified.length + 8) : 0;
  const consistency = 1 - lowRatingRate;
  const recentTrend = prior.length ? recentOverall - priorOverall : 0;
  const recentPoorCount = recent.filter(rating => Number(rating.overall || 0) <= 2).length;

  return {
    count: verified.length,
    overall,
    food: average(verified.map(rating => rating.food)),
    service: average(verified.map(rating => rating.service)),
    lowRatingRate,
    recentOverall,
    recentFood: average(recent.map(rating => rating.food)),
    recentService: average(recent.map(rating => rating.service)),
    recentTrend,
    recentPoorCount,
    confidence: clamp01(confidence),
    consistency: clamp01(consistency)
  };
}

export function assessQuality(summary) {
  if (summary.count < QUALITY_THRESHOLDS.minimumRatings) {
    return { signal: "building", reason: "Building verified rating history" };
  }

  if (
    summary.overall < QUALITY_THRESHOLDS.alertAverage
    || summary.recentPoorCount >= QUALITY_THRESHOLDS.recentPoorCount
    || summary.lowRatingRate >= QUALITY_THRESHOLDS.alertLowRatingRate
  ) {
    return { signal: "alert", reason: "Verified feedback indicates a material quality decline" };
  }

  if (
    summary.overall < QUALITY_THRESHOLDS.watchAverage
    || summary.lowRatingRate >= QUALITY_THRESHOLDS.watchLowRatingRate
  ) {
    return { signal: "watch", reason: "Quality trend requires monitoring" };
  }

  return { signal: "healthy", reason: "Meets the Yagoya quality standard" };
}

export function merchantQualityNotice(ratings, summary) {
  const verified = ratings.filter(rating => rating.verified);
  const recent = recentSlice(verified, QUALITY_THRESHOLDS.recentWindow);
  const themes = new Map();
  const add = (label, weight = 1) => themes.set(label, (themes.get(label) || 0) + weight);

  for (const rating of recent) {
    const comment = String(rating.comment || "").toLowerCase();
    if (Number(rating.food || 0) <= 2 || /(cold|stale|burnt|fresh|food|chips)/.test(comment)) add("Food consistency");
    if (Number(rating.service || 0) <= 2 || /(service|rude|waiter)/.test(comment)) add("Service experience");
    if (/(wrong|missing|incorrect|forgot)/.test(comment)) add("Order accuracy");
    if (/(slow|late|wait|waiting|delay)/.test(comment)) add("Preparation time");
  }

  const concern = summary.count >= QUALITY_THRESHOLDS.minimumRatings
    && (summary.signal === "alert" || summary.signal === "watch" || summary.recentPoorCount >= QUALITY_THRESHOLDS.recentPoorCount);

  return {
    concern,
    baselineReached: summary.count >= QUALITY_THRESHOLDS.minimumRatings,
    recentPoorCount: Number(summary.recentPoorCount || 0),
    recentWindow: Math.min(QUALITY_THRESHOLDS.recentWindow, summary.count),
    themes: [...themes.entries()].sort((a,b) => b[1]-a[1]).slice(0,3).map(([label]) => label),
    privacyNote: "Yagoya protects customer identity. Merchant quality notices use aggregated verified feedback and do not expose reviewer identity, order number or exact review timing."
  };
}

export function qualityBadge(workflowStatus, signal) {
  if (workflowStatus === "suspended") return { label: "Quality suspended", tone: "danger" };
  if (workflowStatus === "intervention") return { label: "Under intervention", tone: "danger" };
  if (workflowStatus === "probation") return { label: "Quality probation", tone: "warn" };
  if (signal === "alert") return { label: "Quality alert", tone: "danger" };
  if (signal === "watch" || workflowStatus === "watch") return { label: "Quality watch", tone: "warn" };
  if (signal === "building") return { label: "Building rating history", tone: "info" };
  return { label: "Yagoya quality standard", tone: "ok" };
}

export function isEligibleForProximityRecommendation(merchant) {
  return merchant.enabled
    && merchant.qualityWorkflow?.status === "healthy"
    && merchant.qualitySummary?.signal === "healthy";
}
