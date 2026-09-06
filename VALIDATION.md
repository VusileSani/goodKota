# GoodKota v6.0 Scale Foundation — Validation

Validated: 2026-09-06

## Release validation completed

### Automated application tests — PASS (11/11)

1. v6 data persists as separated top-level collections and monetary values use integer cents.
2. Legacy v5 money values and sequential display IDs migrate safely.
3. Repository list contracts are bounded and cursor-shaped.
4. Checkout is idempotent, uses scattered internal IDs, and creates delivery state once.
5. Delivery assignment and completion protect task/driver concurrency.
6. Owner and Admin authority remain distinct and GoodKota cannot lose its last active Owner.
7. Support activity is append-only and survives staff handover.
8. Quality refresh updates only the affected merchant summary.
9. Driver location remains a single expiring hot snapshot.
10. The local financial ledger prevents cumulative over-refunds.
11. A synthetic 10,000-merchant / 20,000-order dataset still returns bounded UI-facing pages.

### Static/release tests — PASS (8/8)

1. All JavaScript files pass Node syntax validation.
2. All relative JavaScript imports resolve.
3. Views do not read global store collections directly.
4. Package/config/index metadata identifies v6 and JSON parses cleanly.
5. HTML IDs are unique and local asset references resolve.
6. Active UI source contains no prototype/demo labels.
7. Required scale/production enforcement artefacts are present.
8. Service worker, manifest and notification asset references resolve.

### Additional validation — PASS

- `index.html` parsed successfully.
- `css/styles.css` parsed successfully with no stylesheet parse errors.
- `firestore.rules` delimiter/structure validation passed.
- `firestore.indexes.json`, `firebase.json`, `package.json` and `config/production.json` parse successfully.
- Final archive integrity is verified after packaging with `unzip -t`.

## Production boundary

The included Firestore Rules, indexes, Cloud Functions and production configuration are the intended Firebase production target. Before live deployment, configure the real Firebase project, authentication/custom claims, App Check, payment-provider signature verification/secrets and environment-specific credentials, then run Firebase Emulator Suite / deployment validation against that project.

The payment webhook intentionally fails closed until a real payment-provider verifier is configured.

## Environment limitation during this validation

Automated Chromium rendering/navigation is blocked by the execution environment's browser policy. Therefore graphical browser/device regression was not claimed as passed. The application should receive the normal laptop/phone visual smoke test before production deployment. This does not affect the completed source, architecture, data, concurrency or package-integrity checks above.
