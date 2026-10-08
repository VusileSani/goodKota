# GoodKota v23.2 — Firestore compatibility safeguards

- Validate Firestore document identifiers before writing, including profile keys.
- Reject duplicate entity identifiers rather than silently overwriting entities.
- Reject transactions requiring over 450 writes before staging any writes; this is a conservative safety ceiling, not a solution to the full-state transaction architecture.
- Added `tests/firestore-guards.mjs` covering invalid identifiers, duplicates and oversized transactions.
- Retains all v23.1 request-security corrections and existing user-facing workflows.

## Known blockers
- Full `npm test` cannot complete in this environment: `firebase-admin` package is absent (incomplete `node_modules`), and dependency installation is unavailable.
- No live Firebase, browser or Payfast end-to-end verification.
- Full-state Firestore transaction design remains and must be replaced by targeted domain repositories before production scaling.
- Not approved for production deployment.
