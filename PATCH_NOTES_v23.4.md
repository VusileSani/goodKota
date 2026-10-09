# GoodKota v23.4 — Operational Completeness & Pilot Reliability

## Customer and account experience
- Removed the `All / Under R60 / Chicken / Russian / Customisable` discovery strip. Discovery now prioritises location, search and real merchant cards.
- Reworked authentication hierarchy so Sign in is the primary action, Create account is clearly separated, Forgot password is a text action, and merchant invitation activation is tertiary.
- Customer registration now captures first name, last name, mobile number, email and password once. The authenticated email is canonical.
- Customer profile details are persisted server-side and reused on future sessions/orders. Customers edit them from Account; checkout shows a compact identity summary instead of asking for the same details again.
- Merchant applications prefill retained customer contact details where appropriate.

## Notifications
- Marking an accepted order Ready creates a customer-specific persisted in-app notification exactly once.
- Notification history and read state persist across sessions.
- Customers can opt into browser/device alerts while GoodKota is open; the service worker displays new Ready alerts when the tab is hidden.
- Ready transitions also invoke a transactional email adapter. When `RESEND_API_KEY` and `GOODKOTA_MAIL_FROM` are configured, email is sent to the canonical order email. Delivery failure does not roll back the Ready status or in-app notification.
- Merchants receive an operational warning when Ready email delivery fails or is not configured.
- Admin Overview explicitly shows when Ready email delivery is not configured.

## Administration and registration
- Added a searchable Customers section backed by Firebase Authentication plus retained GoodKota profile/order metadata.
- Directory shows name, email, mobile, verification/disabled state, profile completeness, registration date, last sign-in and order count.
- Admin and merchant accounts are excluded from the customer list by server-side role classification.
- Directory role lookup is batched per page rather than performing one role-store read per user.
- Genuine verified Firebase customers are no longer blocked by a stale `GOODKOTA_PILOT_UIDS` allowlist. Merchant access remains invitation-based; admin remains bound to `GOODKOTA_ADMIN_UID` and MFA.

## Reliability and hosting
- Session cookie is `__session`, which survives Firebase Hosting rewrites.
- Firebase Admin SDK loading is lazy so injected/mocked test environments do not fail before the relevant cloud path is exercised; production still requires the declared `firebase-admin` dependency.
- Service-worker cache version is `goodkota-v23.4` and API responses remain excluded from caching.
- Dead discovery-filter state/CSS and obsolete checkout identity handoff state were removed.

## Verification
All 18 repository test suites pass in this environment, covering static validation, menu integrity, operations, local auth, Firebase identity, Firebase HTTP/session boundaries, mail adapters, actor isolation, Firestore partitioning/guards, cloud HTTP behavior, client sync, rendering, merchant UX, PayFast onboarding/setup, geolocation and order limits.

See `RELEASE_AUDIT_v23.4.md` for the operational audit and the small set of checks that require the live Firebase/Cloud Run environment.
