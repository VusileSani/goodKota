# GoodKota v23 · production architecture foundation

This build consolidates the working GoodKota v22 private pilot and the v23 production-architecture work completed on 7 October 2026. The customer and merchant product surface remains intentionally stable while the cloud persistence layer moves away from the single operational Firestore document.

Firebase Hosting serves the app and routes `/api/**` to the Node API on Cloud Run. Firebase Authentication provides identity and verified email; the API remains authoritative for sessions, roles, prices, order rules and merchant actions. Online payment remains off until the PayFast split, settlement, webhook and refund contract is confirmed and implemented server-side.

## v23 architecture

New cloud writes use partitioned Firestore documents for merchants, orders, merchant applications, support cases, customer profiles and audit events. The adapter can read the legacy v22 `goodkota_pilot_private/operations` document so an existing pilot can migrate on its next successful write; v23 does not write that legacy operations document. Role state remains separately stored while the role repository is migrated in a later targeted change.

The v23 adapter deliberately preserves the v22 repository transaction contract during this migration. This is a compatibility bridge, not the final high-throughput order path: commands still assemble the operational state during a transaction. The next backend optimization should move order and merchant commands to targeted document transactions/counters without changing the client contract. Do not add microservices or distributed infrastructure merely to remove this bridge.

Request correlation IDs and structured server-side error logging are included. Internal errors and stack traces are not exposed to clients.

## Security and operational invariants

- Firestore rules deny direct browser reads and writes; Cloud Run accesses private data through its service identity.
- The API enforces account status, verified email and role permissions. Admin sessions require the configured TOTP factor.
- Order pricing and merchant ownership are server-authoritative. Never trust browser totals or role claims.
- Existing order state-transition rules, idempotent request IDs, customer cancellation rules and server-side abuse limits must not be weakened.
- Customer geolocation remains in memory only, with area fallback. Merchant coordinates are validated server-side.
- API responses are excluded from service-worker caching. Security headers remain enabled.
- Never commit Firebase Admin credentials, PayFast secrets, session secrets or production customer data.

## Build and release gate

From a clean checkout run:

```bash
npm ci
npm run build
npm test
```

All suites must pass before deployment, including `firebase-server`, `firestore-storage`, `cloud-http`, `payfast-setup`, `geo`, and `order-limits`. A partially installed dependency tree is not a valid test environment.

This review environment could execute the migration-specific Firestore test successfully, but its clean `npm ci` repeatedly timed out before dependencies finished installing. Consequently this package is **not represented as having passed the complete clean-install test gate here**. Run the three commands above in the deployment workstation/CI before release.

## Deployment

Read `docs/CLOUD-PILOT.md` before deploying. Use Firebase Hosting + Cloud Run for the full pilot; GitHub Pages cannot provide the same-origin authenticated API. Use the dedicated runtime service account and Application Default Credentials rather than downloaded service-account keys.

Seed merchants/products remain test data until deliberately replaced with verified merchant records and real merchant pins. Do not enable real payments until the PayFast integration requirements in `docs/PAYFAST-INTEGRATION.md` and `docs/PAYFAST-SPLIT-DECISIONS.md` are resolved.
