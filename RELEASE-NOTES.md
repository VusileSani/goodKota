# GoodKota v6.1 — Integrated Product Rollup

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
