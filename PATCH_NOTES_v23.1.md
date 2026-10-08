# GoodKota v23.1 — limited security patch

Changes:
- Reject malformed request URLs with a controlled HTTP 400 response.
- Require an explicit `Bearer ` prefix for the Payfast setup token; previously a bare token was accepted.
- Return a controlled HTTP 503 when session verification fails during order/action submissions, instead of an unhandled request failure.

Validation:
- `node --check server/server.mjs`: passed.
- `node tests/static-validation.mjs`: passed.
- `node tests/order-limits.mjs`: passed.
- Full `npm test`: BLOCKED after five passing suites because firebase-admin dependency was unavailable in this environment (`ERR_MODULE_NOT_FOUND`). `npm ci` did not finish successfully.

This is NOT a completed remediation of the independent audit and NOT a production release. Do not deploy until dependency installation, full test suite, cloud integration tests, and browser testing succeed. The Firestore compatibility transaction still requires architectural work.
