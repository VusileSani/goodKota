# GoodKota v6.1 Integrated Product Rollup — Validation

Validated: 2026-09-07

## Automated application tests — PASS (19/19)

1. v6.1 persists separated top-level collections and integer-cents money.
2. Legacy v5 money/display IDs migrate safely.
3. Repository lists remain bounded and cursor-shaped.
4. Checkout is idempotent and uses scattered internal IDs.
5. Delivery assignment/completion protect task and driver concurrency.
6. Owner/Admin authority remains distinct and GoodKota cannot lose its last Owner.
7. Support history is append-oriented and supports staff handover.
8. Quality refresh updates only the affected merchant.
9. Driver location remains one expiring hot snapshot.
10. Cumulative over-refunds are blocked.
11. Synthetic 10,000-merchant / 20,000-order data still returns bounded UI pages.
12. v6.0 collection-separated browser state migrates to v6.1 without losing operations.
13. Promo/tip/scheduled checkout pricing is derived from the catalogue rather than browser prices.
14. Merchant catalogue maintenance is tenant-scoped and supports image/visibility changes.
15. Merchant applications, driver applications and waitlist intake reach durable operating queues.
16. GoodKota Admin can onboard/administer drivers with administration/audit events.
17. Merchant storefront URLs deep-link correctly and the QR adapter receives the stable URL.
18. Brand/social settings remain Owner-only and auditable.
19. GoodKota Admin all-order oversight remains bounded and searchable.

## Static/release tests — PASS (8/8)

1. All application and Cloud Function JavaScript passes Node syntax validation.
2. All relative JavaScript imports resolve.
3. Views do not bypass repository boundaries by reading global collections directly.
4. Package/config/index metadata identifies v6.1 and JSON parses cleanly.
5. App/public HTML IDs and local asset references are valid; required public intake surfaces exist.
6. Active operating UI contains no development-facing prototype/demo labels.
7. Production enforcement artefacts and v6.1 server command contracts are present.
8. Service-worker, manifest and notification asset references resolve.

**Automated total: 27/27 PASS.**

## Additional validation — PASS

- `index.html` and `website.html` parsed successfully.
- `css/styles.css` and `css/website.css` parsed with no stylesheet parse errors.
- Both HTML files have unique IDs.
- `package.json`, Functions package, Firebase config, Firestore indexes, production config and web manifest parse successfully.
- Firestore Rules delimiter/structure sanity check passes.
- Final archive receives `unzip -t` integrity validation after packaging.

## Chromium environment check

Chromium is installed, but headless Chromium does not complete navigation in this execution environment: even `about:blank` hangs until the process timeout while the container reports unavailable system/DBus services. Browser rendering is therefore **not** claimed as automated-pass. This is an environment limitation rather than a failing GoodKota test.

Run the normal laptop/phone visual smoke test before a live production deployment. The source, migration, integrity, scale, authority, static and package checks above are automated.

## Production boundary

The included Firebase artefacts are a production target, not deployed credentials. Before live deployment configure the real Firebase project, Authentication/custom claims, App Check, secrets and a real South African marketplace payment provider. The payment adapter remains deliberately fail-closed until signed provider verification is configured.
