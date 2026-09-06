function stableBucket(value) {
  let hash = 2166136261;
  for (const char of String(value || "anonymous")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export function isFeatureEnabled(platform, flagName, subjectId = "anonymous") {
  const flag = platform?.featureFlags?.[flagName];
  if (!flag || flag.enabled === false) return false;
  const rollout = Math.max(0, Math.min(100, Number(flag.rolloutPercent ?? 100)));
  return stableBucket(`${flagName}:${subjectId}`) < rollout;
}
