# GoodKota v6.1.1 — Visible UI Rollup

GoodKota v6.1.1 keeps the v6 Scale Foundation and the full v6.1 product rollup intact, while correcting the visible GoodKota interface layer so the agreed branding, actor separation and operating workspaces are clearly present.

## Actors

- **Customer** — discover nearby merchants, order, pay, schedule, apply promotions, tip, track delivery and request support.
- **Merchant** — operate orders, maintain its own catalogue, manage settlement, monitor quality, print a direct-storefront QR and request support.
- **Driver** — manage assigned deliveries and proof of delivery.
- **Delivery Ops** — dispatch and monitor live delivery work.
- **GoodKota Admin** — run merchant/driver onboarding, applications, compliance, commercial status, promotions, cross-merchant orders, support, announcements and routine platform operations.
- **GoodKota Owner** — govern GoodKota authority, company-wide controls, official brand/social configuration and the full privileged audit.

The actor switcher exists for product testing. Production authority is enforced with Firebase Authentication/custom claims, App Check, Firestore Security Rules and Cloud Functions.

## v6.1.1 visible UI correction

- stronger orange GoodKota header and customer hero
- visible actor-context strip tied to the View as switcher
- distinct Merchant, Driver, Delivery Ops, Admin and Owner workspace heroes
- orange Admin operations identity and darker Owner governance identity
- stable overlays without page zoom/scale changes
- runtime fix for the Admin overview materialized summary

## v6.1 product rollup

- any real merchant street address can be captured and resolved to coordinates
- merchant catalogue add/edit/hide plus optional product-image URLs
- merchant-specific storefront deep links and printable QR codes
- public GoodKota website for Kota Culture, promotions, merchant applications, driver applications and customer waitlist
- Owner-configured official website/social links with light app navigation
- Admin application queues, driver administration, promotions and bounded all-order oversight
- promo-code checkout, tips and scheduled orders
- customer/merchant/driver support continuity through the GoodKota Admin queue
- stronger but restrained GoodKota orange brand presence
- v6.0 browser-state migration to v6.1 without wiping operational data

## Scale foundation retained

- bounded repository/query contracts and cursor-shaped pagination
- scattered internal IDs separate from human GoodKota order numbers
- integer-cents financial storage
- bounded geospatial discovery and dispatch candidate queries
- idempotent commands and concurrency-protected delivery assignment
- append-oriented payment, delivery, support, audit and administration events
- materialized operational summaries rather than global dashboard scans
- short-lived current driver-location snapshots
- server-authoritative production commands for consequential writes
- Firestore indexes, Security Rules, retention, observability, analytics, load-test and disaster-recovery specifications

## Merchant model

A Merchant is the actual operating store/location. It directly owns its address, coordinates, menu, delivery, compliance, settlement, quality and commercial state. Orders reference `merchantId`; no mandatory Outlet layer is introduced.

## Production flow

```text
clients / public website
  -> Firebase Authentication where required + App Check
  -> indexed / bounded Firestore reads
  -> Cloud Functions for consequential or public-intake writes
  -> Firestore transactions + append-only event records
  -> async jobs / FCM / analytics export
```

Direct browser writes remain prohibited for platform authority, public applications, merchant catalogue changes, payments, order/delivery transitions, driver administration and privileged audit.

See `docs/INTEGRATED-PRODUCT-ROLLUP.md`, `docs/SCALE-FOUNDATION.md`, `PLATFORM-GOVERNANCE.md`, `FIREBASE-SCHEMA.md` and `VALIDATION.md`.
