# Integrated Product Rollup — v6.1

v6.1 closes the gap between Yagoya's approved product direction and the v6 Scale Foundation.

## Domain boundaries

- **Commerce:** merchants, products, promotions, orders, payments, refunds and settlements.
- **Delivery:** drivers, vehicles, current locations, delivery tasks, assignments, events and proof of delivery.
- **Quality:** verified order ratings and materialized merchant quality summaries.
- **Platform operations:** applications, support, announcements, Admin activity and operational interventions.
- **Governance:** Owner authority, company controls, brand configuration and privileged audit.
- **Public brand:** Kota Culture, waitlist, merchant/driver intake and official social links.

## Scale rules

1. UI lists are bounded and production queries must be indexed/cursor-based.
2. A Merchant is one operating location; tenant writes must include and enforce `merchantId`.
3. Money is integer cents and authoritative totals are calculated from persisted catalogue/fee/promotion data.
4. Payment success, order state, dispatch, delivery completion and governance cannot be trusted to the browser.
5. Public forms write through App Check protected commands; direct Firestore writes are denied.
6. Privileged corrections create new events/audit history instead of silently rewriting history.
7. Current-location data is ephemeral; durable delivery events carry history.
8. Public branding is projected separately from protected platform controls.

## QR adapter

The browser build uses an external QR-image adapter to make merchant storefront QR printing testable without adding a QR dependency. Production may replace that adapter with server-side or in-app QR generation while preserving the stable storefront URL contract (`?merchant=<merchantId>`).
