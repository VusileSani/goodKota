import { average } from "../core/utils.js";

export const QUALITY_THRESHOLDS = Object.freeze({
  minimumRatings: 5,
  recommendationMinimumRatings: 5,
  recommendationAverage: 4.0,
  alertAverage: 3.2,
  watchAverage: 3.6,
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
  const recent = recentSlice(verified, 5);
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
    || summary.lowRatingRate >= QUALITY_THRESHOLDS.alertLowRatingRate
  ) {
    return { signal: "alert", reason: "Frequent low ratings or a materially weak recent average" };
  }

  if (
    summary.overall < QUALITY_THRESHOLDS.watchAverage
    || summary.lowRatingRate >= QUALITY_THRESHOLDS.watchLowRatingRate
  ) {
    return { signal: "watch", reason: "Quality trend requires monitoring" };
  }

  return { signal: "healthy", reason: "Meets the Yagoya quality standard" };
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
