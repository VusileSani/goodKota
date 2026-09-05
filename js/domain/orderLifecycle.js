const COLLECTION_FLOW = ["PENDING", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];
const DELIVERY_FLOW = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DISPATCHED", "COMPLETED"];

export function orderFlow(fulfilmentType) {
  return fulfilmentType === "DELIVERY" ? DELIVERY_FLOW : COLLECTION_FLOW;
}

export function nextOrderStatus(order) {
  const flow = orderFlow(order.fulfilmentType);
  const index = flow.indexOf(order.status);
  if (index < 0 || index === flow.length - 1) return null;
  return flow[index + 1];
}

export function canReject(order) {
  return order.status === "PENDING";
}

export function transitionOrder(order, nextStatus, at = new Date().toISOString()) {
  if (nextStatus === "REJECTED" && canReject(order)) {
    return appendStatus(order, nextStatus, at);
  }

  const expected = nextOrderStatus(order);
  if (!expected || expected !== nextStatus) {
    throw new Error(`Invalid order transition: ${order.status} → ${nextStatus}`);
  }

  return appendStatus(order, nextStatus, at);
}

function appendStatus(order, status, at) {
  return {
    ...order,
    status,
    statusHistory: [
      ...(order.statusHistory || []),
      { status, at }
    ]
  };
}

export function orderProgress(order) {
  const flow = orderFlow(order.fulfilmentType);
  if (order.status === "REJECTED") return [];
  const currentIndex = flow.indexOf(order.status);
  return flow.map((status, index) => ({
    status,
    reached: index <= currentIndex,
    current: index === currentIndex
  }));
}
