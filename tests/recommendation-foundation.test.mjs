import test from "node:test";
import assert from "node:assert/strict";
import { recommendationProfile, rankNearbyMerchants } from "../js/services/recommendation-service.js";

const healthy = (id, distanceKm, overall, count, lowRatingRate = 0, recentTrend = 0) => ({
  id,
  enabled: true,
  distanceKm,
  commercial: { status: "active" },
  qualityWorkflow: { status: "healthy" },
  qualitySummary: {
    signal: "healthy",
    overall,
    food: overall,
    recentOverall: overall,
    recentFood: overall,
    count,
    lowRatingRate,
    confidence: count / (count + 8),
    consistency: 1 - lowRatingRate,
    recentTrend
  }
});

test("quality can outrank a slightly closer merchant", () => {
  const closer = healthy("closer", 1.0, 3.7, 30, 0.10);
  const better = healthy("better", 1.7, 4.8, 30, 0.02);
  const ranked = rankNearbyMerchants([closer, better], { radiusKm: 10, limit: 10 });
  assert.equal(ranked[0].id, "better");
});

test("Yagoya Recommended requires sufficient verified evidence", () => {
  assert.equal(recommendationProfile(healthy("new", 1, 5, 2)).state, "not_enough_evidence");
  assert.equal(recommendationProfile(healthy("proven", 1, 4.6, 20)).state, "recommended");
});

test("quality workflow concerns suppress recommendation status", () => {
  const merchant = healthy("watch", 1, 4.8, 50);
  merchant.qualityWorkflow.status = "watch";
  assert.equal(recommendationProfile(merchant).state, "quality_concern");
});

test("ranking contract contains no paid-promotion input", () => {
  const source = recommendationProfile.toString();
  assert.equal(/sponsor|promotion|paid/i.test(source), false);
});
