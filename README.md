# Yagoya v6.4.0 — Firebase Authentication Foundation

This build is preconfigured for the Yagoya Firebase web app (`yagoya-7dad0`) and adds real Firebase Email/Password identity while retaining the existing Yagoya product prototype.

## Firebase Console prerequisite
Enable **Authentication → Sign-in method → Email/Password**. The Firebase web configuration in the browser is project identification, not a service-account secret. Never place Admin SDK/service-account private keys in this build.

## Authentication boundary
Customer self-registration creates authentication identity only. Merchant memberships and Yagoya Admin/Owner authority remain separately assigned and must be enforced by Firestore Security Rules, custom claims and Cloud Functions in production. The header actor selector is labelled **Preview as** because it remains a prototype UI simulator, not an authorization mechanism.

# Yagoya v6.3.1 — Recommendation + Brand Continuity Foundation

Yagoya is now the product identity. The customer proposition is **“We tell you where the good food is.”** The platform is a trusted local-food discovery and ordering system: kota remains an important opening category, while quality independent food merchants can participate more broadly.

This release adds a recommendation layer after bounded geospatial discovery. Nearby merchants are ranked using verified quality, evidence confidence, consistency, recent trend and proximity. Paid promotion is deliberately excluded from the recommendation contract. Delivery remains a fulfilment capability rather than the defining product.

Mobile pages use the natural device viewport and avoid focus-induced scaling while preserving intentional accessibility zoom. Existing GoodKota/Yagoya v6.1 browser data is migrated into the v6.3 namespace.

See `docs/RECOMMENDATION-QUALITY-ARCHITECTURE.md` and `docs/LOCATION-ARCHITECTURE.md`.

# Yagoya v6.1.2 — Logo Restoration

This release restores the persistent Yagoya header logo at all responsive widths while preserving the v6.1.1 visible UI rollup and v6 scale foundation.

# Yagoya v6.1.1 — Visible UI Rollup

Yagoya v6.1.1 keeps the v6 Scale Foundation and the full v6.1 product rollup intact, while correcting the visible Yagoya interface layer so the agreed branding, actor separation and operating workspaces are clearly present.

## Actors

- **Customer** — discover nearby merchants, order, pay, schedule, apply promotions, tip, track delivery and request support.
- **Merchant** — operate orders, maintain its own catalogue, manage settlement, monitor quality, print a direct-storefront QR and request support.
- **Driver** — manage assigned deliveries and proof of delivery.
- **Delivery Ops** — dispatch and monitor live delivery work.
- **Yagoya Admin** — run merchant/driver onboarding, applications, compliance, commercial status, promotions, cross-merchant orders, support, announcements and routine platform operations.
- **Yagoya Owner** — govern Yagoya authority, company-wide controls, official brand/social configuration and the full privileged audit.

The actor switcher exists for product testing. Production authority is enforced with Firebase Authentication/custom claims, App Check, Firestore Security Rules and Cloud Functions.

## v6.1.1 visible UI correction

- stronger orange Yagoya header and customer hero
- visible actor-context strip tied to the View as switcher
- distinct Merchant, Driver, Delivery Ops, Admin and Owner workspace heroes
- orange Admin operations identity and darker Owner governance identity
- stable overlays without page zoom/scale changes
- runtime fix for the Admin overview materialized summary

## v6.1 product rollup

- any real merchant street address can be captured and resolved to coordinates
- merchant catalogue add/edit/hide plus optional product-image URLs
- merchant-specific storefront deep links and printable QR codes
- public Yagoya website for Kota Culture, promotions, merchant applications, driver applications and customer waitlist
- Owner-configured official website/social links with light app navigation
- Admin application queues, driver administration, promotions and bounded all-order oversight
- promo-code checkout, tips and scheduled orders
- customer/merchant/driver support continuity through the Yagoya Admin queue
- stronger but restrained Yagoya orange brand presence
- v6.0 browser-state migration to v6.1 without wiping operational data

## Scale foundation retained

- bounded repository/query contracts and cursor-shaped pagination
- scattered internal IDs separate from human Yagoya order numbers
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
