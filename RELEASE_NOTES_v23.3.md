# GoodKota v23.3 — public registration pilot candidate

Changes from supplied v23.2:
- Firebase Hosting-compatible `__session` cookie for authenticated API rewrites.
- Public Firebase customer sign-up can exchange a session when `GOODKOTA_PILOT_UIDS` is unset. An explicitly configured UID allowlist remains supported.
- Merchant invitation redemption requires a verified email. Admin still requires configured UID and TOTP.
- Stable Firestore audit event IDs across map key ordering changes.
- Regression tests updated for merchant verification and Hosting cookie.

## Important limitations
- This is a candidate build, NOT a verified production release. Full npm test and npm build could not complete in the authoring environment because dependencies were unavailable/incomplete. Run `npm ci && npm run build && npm test` in a Node 24+ environment before deployment.
- No live Firebase, Firestore, Cloud Run or Hosting deployment was performed.
- Real payment settlement is disabled. Merchant approvals require a working admin session and backend.
- Public registration creates real Firebase Auth accounts, but the app requires a deployed Cloud Run API for persistent sessions and operational workflows.
- The existing Firestore compatibility repository still performs collection-wide reads/transactions and needs targeted operations before scale.
