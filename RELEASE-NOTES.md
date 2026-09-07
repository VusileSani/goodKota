# GoodKota v6.1.2 — Logo Restoration

- Fixed a responsive regression that hid the GoodKota logo below 700px by hiding every span inside the brand control.
- The official GoodKota logo now remains visible in the persistent header across Customer, Merchant, Driver, Delivery Ops, GoodKota Admin and GoodKota Owner views.
- The wordmark may collapse on narrow screens, but the logo itself never does.
- The logo remains the primary home/navigation anchor.
- Added a regression test to prevent blanket `.brand span` hiding from returning.

# GoodKota v6.1.1 — Visible UI Rollup

v6.1.1 is the corrected release of the v6.1 Integrated Product Rollup. The v6.1 functional additions were present in code, but the visible shell did not reflect the agreed GoodKota interface treatment strongly enough. This release fixes that gap without changing the v6.1 data schema.

## Visible interface correction

- Stronger GoodKota orange identity in the main header, customer home hero, active navigation, selected merchant states and operational cards.
- Clear actor-context strip for Customer, Merchant, Driver, Delivery Ops, GoodKota Admin and GoodKota Owner.
- Merchant, Driver and Delivery Ops now open with actor-specific workspace heroes rather than generic section headings.
- GoodKota Admin uses an orange platform-operations hero; GoodKota Owner remains a deliberately darker company-governance environment.
- Merchant storefront QR, menu maintenance and full order-detail access remain surfaced in the merchant workspace.
- App header keeps the ordering experience lean while exposing Explore GoodKota; configured social links remain optional.
- Public GoodKota website remains the brand/content hub for Kota Culture, promotions, merchant applications, driver applications and waitlist.
- Overlay behaviour remains viewport-stable; opening and closing dialogs does not scale or zoom the app.

## Runtime correction

- Fixed the GoodKota Admin overview materialized-summary reference so the Admin overview does not rely on an out-of-scope variable.

## Compatibility

The browser storage namespace and schema remain `goodkota_integrated_v6_1` / schema `6.1`, so a v6.1.1 UI correction does not wipe v6.0/v6.1 operational browser data.

## Integrated product capabilities retained

This release consolidates the agreed GoodKota product updates on top of v6.0 rather than replacing the Scale Foundation.

## Operations and governance

- Owner and GoodKota Admin remain separate authority layers.
- Admin gains bounded cross-merchant order oversight, driver administration, merchant/driver application queues and promotion management.
- Owner retains exclusive control of platform authority, protected company controls and official GoodKota brand/social configuration.
- GoodKota still enforces at least one active Owner.
- Admin and Owner interventions remain auditable; ordinary product actors stay scoped to their own work.

## Merchant and customer experience

- Merchant menu maintenance now supports add/edit/hide, price/category/description changes and optional item images.
- Each merchant can generate a printable QR that opens its direct GoodKota storefront.
- Checkout supports promotion codes, tips and future scheduled fulfilment.
- Pricing is re-derived from the current catalogue in the command layer; browser-supplied item prices are not trusted.
- Merchant onboarding remains unrestricted to arbitrary real addresses with coordinates stored on the Merchant.

## Public GoodKota layer

- Added `website.html` as the GoodKota brand/community hub.
- Added Kota Culture, promotions, customer waitlist, merchant application and driver application surfaces.
- Public applications feed GoodKota Admin operating queues.
- Owner may configure official Instagram/Facebook/TikTok links; empty channels remain hidden.

## Production enforcement additions

Added Cloud Function contracts for public merchant/driver/waitlist intake, tenant-scoped merchant catalogue maintenance, Admin driver operations, Admin promotions, application review and Owner brand settings. Firestore remains deny-by-default for these writes.

## Migration

v6.1 reads and migrates v6.0 collection-separated browser data into the new `goodkota_integrated_v6_1` namespace. Existing v5 migration support is retained.
