import { average } from "../core/utils.js";

export const QUALITY_THRESHOLDS = Object.freeze({
  minimumRatings: 5,
  alertAverage: 3.2,
  watchAverage: 3.6,
  alertLowRatingRate: 0.30,
  watchLowRatingRate: 0.20
});

export function summariseRatings(ratings) {
  const verified = ratings.filter(rating => rating.verified);
  const lowRatings = verified.filter(rating => rating.overall <= 2);

  return {
    count: verified.length,
    overall: average(verified.map(rating => rating.overall)),
    food: average(verified.map(rating => rating.food)),
    service: average(verified.map(rating => rating.service)),
    lowRatingRate: verified.length ? lowRatings.length / verified.length : 0
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

  return { signal: "healthy", reason: "Meets the Yagoya Standard" };
}

export function qualityBadge(workflowStatus, signal) {
  if (workflowStatus === "suspended") return { label: "Quality suspended", tone: "danger" };
  if (workflowStatus === "intervention") return { label: "Under intervention", tone: "danger" };
  if (workflowStatus === "probation") return { label: "Quality probation", tone: "warn" };
  if (signal === "alert") return { label: "Quality alert", tone: "danger" };
  if (signal === "watch" || workflowStatus === "watch") return { label: "Quality watch", tone: "warn" };
  if (signal === "building") return { label: "Building rating history", tone: "info" };
  return { label: "Yagoya Standard", tone: "ok" };
}

export function isEligibleForProximityRecommendation(merchant) {
  return merchant.enabled
    && merchant.qualityWorkflow.status === "healthy"
    && merchant.qualitySummary.signal === "healthy";
}
