# GoodKota v23.4 — operational completeness and pilot reliability

GoodKota is a pickup-first local food discovery and ordering platform. Firebase Hosting serves the browser application and rewrites `/api/**` to the Node API on Cloud Run. Firebase Authentication provides identity; the API is authoritative for sessions, roles, customer profiles, merchant ownership, prices, order rules and operational actions.

## v23.4 product baseline

- Customers browse active nearby kota spots without signing in, then authenticate to order, save spots and manage their account.
- Customer identity is captured once (first name, last name, mobile and canonical sign-in email), persisted server-side and reused on future sessions/orders. Checkout is order-focused rather than another registration form.
- Merchant operators are invitation/claim based and can manage only their assigned store, menu, availability, pickup queue, support and PayFast onboarding details.
- Administrators have operational workspaces for customers, applications, merchants, orders, quality, support, reports, payments and activity.
- Ready orders create retained in-app customer alerts. Transactional Ready email is supported when `RESEND_API_KEY` and `GOODKOTA_MAIL_FROM` are configured on the API.
- Online PayFast checkout remains off. The existing PayFast screens collect/onboard account information but do not claim to verify payments or enable split settlement.

## Architecture

New cloud writes use partitioned Firestore documents for merchants, orders, merchant applications, support cases, customer profiles and audit events. The adapter can read the legacy v22 operations document to migrate an existing pilot on a successful write; new operational state is not written back to that legacy document.

The compatibility repository still assembles operational state inside a Firestore transaction. That is acceptable for the private pilot but is not the final high-throughput order architecture. The next backend scaling step should move hot order/merchant commands to targeted document transactions/counters without changing the client contract.

## Security and operational invariants

- Firestore rules deny direct browser reads and writes; Cloud Run accesses private data through its runtime identity.
- Firebase sessions use the Hosting-compatible `__session` cookie.
- Admin sessions require the configured administrator UID and TOTP factor.
- Customer registration is open to valid Firebase accounts; do not reintroduce a general customer UID allowlist. Merchant access remains invitation-based.
- Order pricing, merchant ownership and order transitions are server-authoritative.
- Existing idempotent request IDs, customer cancellation rules and server-side abuse limits must not be weakened.
- Customer geolocation remains in memory only. Merchant coordinates are validated server-side.
- API responses are excluded from service-worker caching. Security headers remain enabled.
- Never commit Firebase Admin credentials, PayFast secrets, Resend API secrets, session secrets or production customer data.

## Build and release gate

From a clean checkout:

```bash
npm ci
npm run build
npm test
```

The repository's 18 configured test suites pass for v23.4 in the engineering environment used to prepare this package. A clean deployment workstation/CI must still run all three commands so `firebase`, `firebase-admin` and `esbuild` are installed from `package-lock.json` and the Firebase client bundle is rebuilt before deployment.

`RELEASE_AUDIT_v23.4.md` records the completed audit. `RELEASE_STATUS_v23.4.md` lists the checks that specifically require the live Firebase/Cloud Run environment.

## Deployment

Read `docs/CLOUD-PILOT.md` before deploying. Use Firebase Hosting + Cloud Run for the full pilot; GitHub Pages alone cannot provide the same-origin authenticated API. Use a dedicated runtime service account and Application Default Credentials rather than downloaded service-account keys.

Seed merchants/products remain test data until deliberately replaced with verified merchant records and real merchant pins.
