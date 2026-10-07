# GoodKota MVP v21 · private cloud pilot

This package builds on v20 and the successful Firebase email sign-in test. It prepares a separate private pilot at `https://goodkota.web.app/`. The current GitHub Pages site remains in place. Firebase Hosting serves the app and sends `/api/**` to its Node API on Cloud Run. Firebase Authentication handles passwords and verified email; the API handles sessions, roles, orders and merchant actions.

The pilot uses Cloud Firestore transactions for shared role and operational state. It accepts only Firebase UIDs listed in `GOODKOTA_PILOT_UIDS` for API sessions. The storefront is visibly marked **Private pilot · Test orders only**. Online payment remains off.

## Start here

Read [docs/CLOUD-PILOT.md](docs/CLOUD-PILOT.md) before deploying. Cloud Run requires a linked billing account and upgrades a Spark project to Blaze. Do not deploy this package by uploading it to GitHub Pages. The v20 `auth-test.html` page can remain there as a separate Firebase-only test.

Local development still uses private JSON files by default. `npm ci`, `npm run build`, `npm test` and `npm start` work as in v20. Set `GOODKOTA_STORAGE=firestore` only when Firestore and Application Default Credentials are configured. The production container runs as an attached Google service identity; it needs no downloaded service-account key.

## Scope and limits

- The cloud test permits customer registration, verified email, order placement, merchant invitation and management once admin TOTP is configured. Admin access remains unavailable until Firebase Authentication with Identity Platform and TOTP are enabled and the admin enrolls an authenticator.
- Role invitations and operational state survive server restarts and concurrent requests through Firestore transactions. The operational state is intentionally a **single capped document** for this pilot. It is not the partitioned order database required for a real launch; stop when the cap is reached and migrate to per-merchant and per-order documents.
- Firestore rules deny direct browser reads and writes. Cloud Run's service account uses IAM. Do not grant users Firestore access to the private pilot collection.
- PayFast setup remains disabled in the cloud pilot; its encrypted local-file store is deliberately blocked. The merchant-primary split and settlement contract still await written PayFast confirmation. No real merchant credentials or payments belong in this pilot.
- Seeded merchants and products are test data. Do not invite real customers or treat pilot orders as live purchases. Backups, monitoring, data retention and operational recovery are needed before a public release.
- The API requires a Firebase session cookie and checks account status, email verification and role permissions. Admin sessions require a TOTP sign-in factor. The user-facing app and API are on the same Hosting origin; GitHub Pages is not used for the full pilot because it cannot serve this API under its own `/api` path.

The v20 local build remains available as a rollback reference. This v21 package does not migrate v19 local accounts, sessions or browser demo data.
