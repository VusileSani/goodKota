# v23.3 – Administrator account visibility

- Added admin-only, server-side Firebase Authentication user directory with 100-record pagination.
- Added Customers tab with registration date, last sign-in, verification and disabled state, search of loaded records and refresh.
- No email/password secrets, tokens, or privileged mutation actions are exposed.
- This is an **account directory**, not a definitive customer-only list: roles are not yet joined into the listing.
- Further operational completeness audit is required before declaring production readiness.
