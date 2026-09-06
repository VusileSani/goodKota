# Observability and incident operations

## Required telemetry

Emit structured events with domain, event name, actor UID, merchant ID, request/correlation ID, duration, status and safe metadata.

Dashboards / alerts:
- checkout success rate and p95 latency
- payment webhook verification failures
- order command failures
- ready-for-dispatch backlog and oldest task age
- stuck delivery count
- support cases beyond SLA
- owner/control authority changes
- Cloud Function error rate and latency
- Firestore reads/writes and estimated spend by domain

## Initial SLOs

- Checkout availability: 99.9%
- Checkout p95: <= 2.5s excluding provider-hosted customer interaction
- Order command p95: <= 1.5s
- Dispatch command p95: <= 1.5s
- Tracking read p95: <= 1.0s

## Incident levels

- SEV1: payments/order integrity, data isolation, widespread outage
- SEV2: regional delivery/merchant workflow materially degraded
- SEV3: bounded feature/support degradation

## SEV1 sequence

1. Preserve evidence and correlation IDs.
2. Owner may disable the smallest affected platform control with a reason.
3. Do not rewrite financial/order/audit history.
4. Reconcile provider records against append-only payment events.
5. Restore service only after invariant checks pass.
6. Record incident timeline and corrective action.
