export const EXPERIENCE = {
  amazing: { label: "Amazing", tone: "green", score: 2 },
  good: { label: "Good", tone: "amber", score: 1 },
  average: { label: "Average", tone: "red", score: 0 }
};

export function rateCompletedOrder(store, orderId, value) {
  const order = store.state.orders.find(item => item.id === orderId);
  if (!order || order.status !== "completed") throw new Error("You can rate an order after collection.");
  if (order.experience) throw new Error("This order has already been rated.");
  if (!EXPERIENCE[value]) throw new Error("Choose Amazing, Good or Average.");
  order.experience = { value, at: new Date().toISOString() };
  store.log("order_experience_rated", { orderId, merchantId: order.merchantId, value });
  return order.experience;
}

export function merchantExperience(state, merchantId) {
  const ratings = state.orders
    .filter(order => order.merchantId === merchantId && order.status === "completed" && EXPERIENCE[order.experience?.value])
    .sort((a, b) => (b.experience.at || "").localeCompare(a.experience.at || ""))
    .slice(0, 20);
  const counts = { amazing: 0, good: 0, average: 0 };
  for (const order of ratings) counts[order.experience.value]++;
  if (ratings.length < 3) return { tone: "neutral", label: "New feedback", count: ratings.length, counts };
  const score = (counts.amazing * 2 + counts.good) / ratings.length;
  const value = score >= 1.5 ? "amazing" : score >= 0.75 ? "good" : "average";
  return { tone: EXPERIENCE[value].tone, label: EXPERIENCE[value].label, count: ratings.length, counts };
}
