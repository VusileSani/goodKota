# GoodKota v23.4 — operational completeness audit

## Executive result
The agreed v23.4 scope is implemented and locally regression-tested. The audit also found and corrected several issues that were not obvious from the UI: a stale Firebase customer UID allowlist that could block new registrations, a Hosting-incompatible session cookie expectation in an old test, expensive per-user role lookups in the customer directory, and stale discovery/auth UI that earlier checkpoint notes had incorrectly described as fixed.

## Customer journey
### Registration and sign-in
- Sign in is visually/structurally primary; Create account and Merchant invitation are separate actions rather than a single peer-button sentence.
- Registration captures first name, last name, mobile, email and password.
- If profile persistence fails after the identity account is successfully created, GoodKota enters the created account and directs the customer to Account instead of leaving them trapped on a registration form for an email that now already exists.
- Authenticated email is the canonical order/account email and cannot be spoofed through profile or checkout payloads.
- New Firebase customers are not restricted by a manually maintained customer UID list.

### Retained profile and checkout
- First name, last name, mobile and canonical email are persisted in the customer profile.
- Profile data survives repository restart/re-login tests.
- Account is the edit surface. Checkout displays identity, collection and payment information without re-presenting the customer's full personal details as editable fields.
- Server-side order creation prefers retained profile data over any legacy checkout identity payload.
- Because the current pilot is pickup-only, residential/delivery address is deliberately not collected as customer identity data. Merchant pickup address remains separate.

### Discovery
- Arbitrary ingredient/price chips were removed from the customer landing experience and from retained UI state.
- Discovery now uses free search, chosen area, optional in-memory geolocation and merchant availability/distance ordering.
- Search still matches merchant names, areas, menu items/descriptions and available options, so removing the chips does not remove discovery capability.

### Orders and alerts
- Customer order limits, server-authoritative pricing, customer cancellation before acceptance, merchant ownership and allowed status transitions remain enforced.
- Accepted → Ready creates one persistent `order_ready` notification for the owning customer; read state persists.
- While GoodKota remains open, periodic shared-state refresh surfaces new Ready notifications; browser notifications can be enabled and are shown by the service worker when the tab is hidden.
- Ready also attempts transactional email when configured. The merchant sees a warning if external delivery is unavailable/failed; the in-app alert remains durable either way.
- Closed-browser notification delivery therefore has an explicit boundary: it depends on live transactional email configuration. v23.4 does not falsely claim background push/FCM support.

## Merchant journey
- Merchant access remains invitation/claim based and store-scoped.
- Queue lifecycle New → Accepted → Ready → Collected remains intact; cancellation reasons and prior-order/refund-review workflows remain operational.
- Merchant store/menu/availability/support/PayFast-account-intake workflows remain present and tested.
- A merchant cannot operate a store not assigned to their account.

## Administrator journey
- Customers is a first-class admin tab, not an inferred Firebase-only backend concept.
- Customer directory combines Firebase account metadata with GoodKota retained profile/order metadata and filters out merchant/admin roles.
- Directory paging loads up to 1,000 accounts for this pilot, with search across the loaded set and clear cap messaging.
- Role classification is batched per page; order counts are aggregated once rather than repeatedly scanning per user.
- Overview highlights merchant applications, new orders, refunds, support cases, quality issues, PayFast intake and missing Ready-email configuration.
- Existing merchant/application/quality/order/support/report/payment/activity controls remain wired to server-authoritative actions.

## Security and data boundaries
- Firebase Hosting session cookie uses `__session`.
- Firestore rules deny browser reads/writes; API/server identity remains the private data boundary.
- Admin role requires configured UID and TOTP in Firebase mode.
- Customer/merchant actor isolation, verified-email gates, order abuse limits and Firestore document guards pass regression tests.
- Customer exact geolocation remains memory-only; it is not persisted or sent to the API.
- No PayFast secrets are exposed to browser state. Online payment remains disabled until its separate server integration is complete.

## Test result
`npm test` passes all 18 configured suites:

1. static-validation
2. menu-integrity
3. operations
4. auth
5. firebase-auth
6. firebase-server
7. mail
8. actor-isolation
9. firestore-storage
10. cloud-http
11. client-sync
12. render-smoke
13. merchant-ux
14. payfast-onboarding
15. payfast-setup
16. geo
17. order-limits
18. firestore-guards

Negative authorization tests intentionally emit server error log lines for rejected unverified/unauthorised actions; those are expected assertions, not suite failures.

## Live-only acceptance checks
See `RELEASE_STATUS_v23.4.md`. The main live dependency is transactional email configuration for a Ready message that reaches a customer when the app/browser is closed. If the Resend configuration is absent, GoodKota still retains and surfaces the in-app Ready notification and explicitly shows the admin that email delivery is not active.
