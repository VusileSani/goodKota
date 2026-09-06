# GoodKota v6.0 — Scale Foundation

This release applies the v5.0 scale-readiness audit without changing GoodKota's approved product direction.

## Scale architecture

- introduced repository/query boundaries between views and data
- removed direct collection access from application views
- bounded list contracts to a maximum of 100 records with cursor-shaped pagination
- introduced collection-separated local persistence as a production-shaped test adapter
- added Firestore index definitions for high-volume access patterns
- added geohash-based merchant/driver candidate-query contracts

## Concurrency and integrity

- internal IDs now use scattered UUID-style identifiers
- human order numbers are separate display identifiers
- order/payment/background work supports idempotency keys
- production order, dispatch, delivery, Owner/Admin and merchant-control transitions are behind Cloud Functions/transactions
- driver assignment validates both task and driver inside one transaction
- cumulative refund protection prevents refunds exceeding captured payment value
- Owner authority updates preserve unrelated custom claims and compensate if authority persistence fails

## Financial model

- operational money is stored in integer cents
- payment transactions, payment events, refunds, fee allocations, merchant payouts, settlement events and reconciliation runs are separate domains
- payment webhook handling fails closed until a real provider verification adapter is configured
- production payment webhook creates the paid order and delivery task atomically after verified payment

## Delivery and location

- current driver location is one expiring snapshot per driver
- delivery credentials are separated from driver-readable task state
- production delivery task stores only a hash of the customer PIN
- customer-only delivery credential documents expire automatically
- customer tracking access is scoped through the customer's order/task relationship

## Governance and support

- Owner/Admin server-side authority boundaries retained
- at least one active Owner is enforced
- platform control changes require a reason and immutable audit event
- merchant onboarding/profile/status, compliance, commercial and quality intervention server commands are included
- support case and announcement server command boundaries are included

## Operations

- App Check and privileged MFA expectations documented
- Firestore TTL policies defined for ephemeral operational data
- observability, retention, analytics export, load testing and disaster recovery runbooks included
- automated validation suite added under `tests/`
