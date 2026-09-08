# Yagoya v6.6 — Premium Graphite

- Replaced the bright white application background with dark graphite.
- Converted principal cards, navigation, forms, dialogs, tables, account settings and list surfaces to coordinated charcoal elevations.
- Preserved the existing orange Yagoya identity and strengthened it as the primary action/accent colour.
- Added off-white typography, muted secondary text and subtler dark borders/shadows for a more finished production feel.
- Preserved white only where function requires it, notably the merchant QR scan field.
- No product workflows, authentication behavior, account architecture, recommendation logic or backend contracts were removed.

# Yagoya v6.5 — Authentication & Account Refinement

- Preserves the Firebase Email/Password authentication foundation introduced in v6.4.
- Refines Customer → Account into compact progressive-disclosure rows.
- Adds focused sections for My Orders, My Favourites, My Addresses, My Details, Payments, Preferences, Help & Support, and Account & Security.
- Keeps Log Out separate at the bottom and only shows it when authenticated.
- Account & Security reflects live Firebase authentication state and exposes sign-in/create-account controls when signed out.
- Existing customer, merchant, delivery, governance, location and recommendation foundations remain intact.

# Yagoya v6.4.0 — Firebase Authentication Foundation

- Connected the Yagoya web app to Firebase project `yagoya-7dad0`.
- Added Firebase Authentication using the modular browser SDK (`12.8.0`).
- Added Email/Password sign-in, customer account creation, account state and sign-out.
- Kept privileged merchant/platform authority separate from customer self-registration.
- Renamed the prototype actor control from **View as** to **Preview as** so it is not confused with authenticated authority.
- Preserved the v6.3.1 recommendation, brand, scale, location, delivery and governance foundations.
- No service-account credential or private server secret is included in the browser build.

# Yagoya v6.3.0 — Recommendation Foundation

- Renamed the active product and public website to **Yagoya**.
- Repositioned the product around **“We tell you where the good food is.”**
- Broadened customer and merchant language from kota-only to trusted local independent food while retaining kota as an important category.
- Added `recommendation-service.js`; bounded nearby candidates are now ranked by quality, evidence confidence, consistency, recent trend and proximity instead of distance alone.
- Added explicit `recommended`, `not_enough_evidence` and `quality_concern` states.
- `Yagoya Recommended` cannot be purchased: paid promotion is absent from the scoring contract and production configuration.
- Expanded verified rating summaries with confidence, consistency and recent-trend evidence.
- Added a broader local-food merchant/menu example to the seed data.
- Kept the geospatial scale invariant: candidate discovery remains bounded before recommendation scoring.
- Updated public website copy to make discovery, trust, quality monitoring and predictable experience the primary proposition.
- Added natural mobile viewport fitting and 16px mobile form controls to avoid accidental focus zoom without disabling intentional user zoom.
- Moved browser state to `yagoya_integrated_v6_3` while preserving migration reads from earlier GoodKota/Yagoya namespaces.
- Added recommendation architecture and regression tests.

# Yagoya v6.1.2 — Logo Restoration

- Fixed a responsive regression that hid the Yagoya logo below 700px by hiding every span inside the brand control.
- The official Yagoya logo now remains visible in the persistent header across Customer, Merchant, Driver, Delivery Ops, Yagoya Admin and Yagoya Owner views.
- The wordmark may collapse on narrow screens, but the logo itself never does.
- The logo remains the primary home/navigation anchor.
- Added a regression test to prevent blanket `.brand span` hiding from returning.

# Yagoya v6.1.1 — Visible UI Rollup

v6.1.1 is the corrected release of the v6.1 Integrated Product Rollup. The v6.1 functional additions were present in code, but the visible shell did not reflect the agreed Yagoya interface treatment strongly enough. This release fixes that gap without changing the v6.1 data schema.

## Visible interface correction

- Stronger Yagoya orange identity in the main header, customer home hero, active navigation, selected merchant states and operational cards.
- Clear actor-context strip for Customer, Merchant, Driver, Delivery Ops, Yagoya Admin and Yagoya Owner.
- Merchant, Driver and Delivery Ops now open with actor-specific workspace heroes rather than generic section headings.
- Yagoya Admin uses an orange platform-operations hero; Yagoya Owner remains a deliberately darker company-governance environment.
- Merchant storefront QR, menu maintenance and full order-detail access remain surfaced in the merchant workspace.
- App header keeps the ordering experience lean while exposing Explore Yagoya; configured social links remain optional.
- Public Yagoya website remains the brand/content hub for Kota Culture, promotions, merchant applications, driver applications and waitlist.
- Overlay behaviour remains viewport-stable; opening and closing dialogs does not scale or zoom the app.

## Runtime correction

- Fixed the Yagoya Admin overview materialized-summary reference so the Admin overview does not rely on an out-of-scope variable.

## Compatibility

The browser storage namespace and schema remain `yagoya_integrated_v6_1` / schema `6.1`, so a v6.1.1 UI correction does not wipe v6.0/v6.1 operational browser data.

## Integrated product capabilities retained

This release consolidates the agreed Yagoya product updates on top of v6.0 rather than replacing the Scale Foundation.

## Operations and governance

- Owner and Yagoya Admin remain separate authority layers.
- Admin gains bounded cross-merchant order oversight, driver administration, merchant/driver application queues and promotion management.
- Owner retains exclusive control of platform authority, protected company controls and official Yagoya brand/social configuration.
- Yagoya still enforces at least one active Owner.
- Admin and Owner interventions remain auditable; ordinary product actors stay scoped to their own work.

## Merchant and customer experience

- Merchant menu maintenance now supports add/edit/hide, price/category/description changes and optional item images.
- Each merchant can generate a printable QR that opens its direct Yagoya storefront.
- Checkout supports promotion codes, tips and future scheduled fulfilment.
- Pricing is re-derived from the current catalogue in the command layer; browser-supplied item prices are not trusted.
- Merchant onboarding remains unrestricted to arbitrary real addresses with coordinates stored on the Merchant.

## Public Yagoya layer

- Added `website.html` as the Yagoya brand/community hub.
- Added Kota Culture, promotions, customer waitlist, merchant application and driver application surfaces.
- Public applications feed Yagoya Admin operating queues.
- Owner may configure official Instagram/Facebook/TikTok links; empty channels remain hidden.

## Production enforcement additions

Added Cloud Function contracts for public merchant/driver/waitlist intake, tenant-scoped merchant catalogue maintenance, Admin driver operations, Admin promotions, application review and Owner brand settings. Firestore remains deny-by-default for these writes.

## Migration

v6.1 reads and migrates v6.0 collection-separated browser data into the new `yagoya_integrated_v6_1` namespace. Existing v5 migration support is retained.

## Location foundation hardening

- Added exact merchant Directions handoff from the storefront using stored merchant coordinates.
- Added reusable customer location autocomplete with debounce, request cancellation, bounded results and short-lived cache.
- Normalized location objects behind a Yagoya-owned contract instead of exposing provider response shapes to views.
- Added server-mediated production autocomplete boundary so provider credentials, quotas and failover remain backend concerns.
- Kept customer merchant-discovery location session-only; no passive customer location history is created.
- Preserved geohash-first bounded merchant discovery and exact-distance ranking.
- Added explicit location production configuration and architecture documentation.

## v6.3.1 — Brand continuity lock

- Confirmed that the Yagoya rename is not a visual rebrand.
- Retained the approved logo artwork, orange patterned splash artwork, orange-led palette and established UI look and feel unchanged.
- Added a brand-continuity invariant and regression test so future builds do not accidentally redraw or replace the approved visual assets.
- Current user-facing naming remains Yagoya and the recommendation/quality positioning from v6.3 remains intact.
