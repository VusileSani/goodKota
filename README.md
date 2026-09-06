# GoodKota v6.0 — Scale Foundation

GoodKota v6.0 preserves the v5.0 product and governance experience while replacing prototype-shaped internal assumptions with scale-ready contracts.

## Actors

- **Customer** — discover nearby merchants, order, pay and track delivery.
- **Merchant** — manage orders, menu, settlement and request GoodKota support.
- **Driver** — manage assigned delivery and proof of delivery.
- **Delivery Ops** — dispatch and monitor deliveries.
- **GoodKota Admin** — run merchant support, compliance, commercial status, announcements and routine platform operations.
- **GoodKota Owner** — govern platform authority, protected company controls and the full privileged audit.

The actor dropdown is a testing convenience. Production authorization is enforced by Firebase Authentication, Security Rules and server-side commands.

## What changed in v6

- views use bounded repository/query contracts instead of reading global collections directly
- list contracts use limits and cursor-shaped pagination
- internal order IDs are UUID/scattered IDs; human GoodKota order numbers are separate display identifiers
- operational money uses integer cents
- geospatial discovery uses bounded candidate windows before exact distance calculation
- current driver location is one expiring snapshot per driver
- consequential operations have server-side Cloud Function transaction boundaries
- payment, order, support, compliance, commercial and delivery histories are append-oriented
- Owner/Admin authority is designed for server enforcement and immutable audit
- Admin/Owner dashboards consume materialized attention summaries instead of rebuilding global metrics in their views
- quality aggregation updates the affected merchant rather than scanning every merchant on render
- production indexes, Security Rules, retention, observability, analytics, load-test and disaster-recovery specifications are included

## Merchant model

A Merchant is the actual operating store/location. Merchant records directly own address, coordinates, operations, delivery, compliance, settlement, quality and commercial status. Orders reference `merchantId` only.

Merchant onboarding accepts any real South African address and resolves it to coordinates. Manual latitude/longitude entry remains available if address lookup is unavailable.

## Architecture

```text
index.html
css/styles.css
js/app.js
js/core/
js/data/
js/infrastructure/
js/repositories/
js/services/
js/views/
functions/src/
config/production.json
firestore.rules
firestore.indexes.json
firebase.json
docs/
tests/
```

Browser test flow:

```text
views
  -> RepositoryHub (bounded reads)
  -> GoodKotaCommandService (consequential writes)
  -> LocalCollectionDatabase (test adapter)
```

Production flow:

```text
clients
  -> Firebase Authentication + App Check
  -> indexed Firestore reads
  -> Cloud Functions for consequential writes
  -> Firestore transactions / append-only events
  -> FCM / async jobs / BigQuery analytics
```

## Production safety boundary

The included payment provider adapter deliberately fails closed until a real South African marketplace payment provider and signed-webhook verification are configured. Do not weaken this safeguard to make a production checkout appear to work.

Production Owner/Admin authority, payment confirmation, merchant state interventions, order/delivery transitions, refunds and audit writes must remain server-authoritative.

See:
- `docs/SCALE-FOUNDATION.md`
- `docs/SECURITY-AUTH.md`
- `FIREBASE-SCHEMA.md`
- `PLATFORM-GOVERNANCE.md`
- `VALIDATION.md`
