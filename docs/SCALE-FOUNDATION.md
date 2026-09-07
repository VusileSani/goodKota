# Yagoya Scale Foundation — v6.0

## Purpose

v6.0 keeps the v5 product experience while changing the internal contract so the UI is no longer designed around an in-memory copy of the whole company.

### Browser architecture

```text
views
  -> RepositoryHub (bounded reads)
  -> CommandService (consequential writes)
  -> local adapters for product testing
```

The local adapters preserve a runnable prototype. Production swaps those adapters for Firestore queries and callable/HTTP Cloud Functions; the views do not need a rewrite.

## Scale invariants

1. No view reads `store.state` collections directly.
2. List contracts are bounded (`limit <= 100`) and cursor-shaped.
3. Internal IDs are UUID/scattered IDs; `orderNumber` is display-only.
4. Money is integer cents throughout operational and financial domains.
5. Geospatial discovery uses a bounded geographic candidate window before exact distance calculation.
6. Consequential transitions sit behind command boundaries and production counterparts use Firestore transactions.
7. Payment/order/refund/payout history is append-oriented.
8. Order, payment, delivery, support, compliance and commercial changes have event histories.
9. Current driver location is one hot snapshot per driver with TTL; durable movement belongs in events/analytics.
10. Owner/Admin authority is server-enforced in production and Owner invariants are transactional.
11. Quality aggregation updates one affected merchant rather than all merchants.
12. Owner/Admin screens consume materialized rollups and attention lists rather than computing global metrics on render.

## Runtime adapters

The browser currently uses `LocalCollectionDatabase`, which intentionally stores top-level collections separately and mimics production collection boundaries. It is not the production database.

The production contract is:
- Firebase Authentication
- Cloud Firestore
- 2nd-gen Cloud Functions in `africa-south1`
- Firebase Cloud Messaging
- App Check
- optional Cloud Tasks / Scheduler for asynchronous jobs
- BigQuery export for analytical workloads

## Query discipline

See `firestore.indexes.json`. Every high-volume screen must query by tenant/status/time and use limits/cursors. Do not add a new list screen by fetching a collection and filtering it in a component.

## Financial discipline

Operational money fields use `*Cents`. Historical amounts are never silently edited. Corrections are refunds, settlement events or compensating entries.

## Production cutover rule

Do not replace the local repositories with Firestore until Authentication, Security Rules, App Check and the server command functions are deployed together. A partially secured cutover is worse than remaining on the local test adapter.
