# GoodKota v6.1.1 Visible UI Rollup — Validation

## Result

**43 / 43 automated tests passed.**

The v6.1.1 correction retains the v6.1 data schema and scale foundation while making the previously agreed GoodKota UI changes visibly present in the packaged application.

## Scale / integrity tests — 19 passed

- separated top-level persistence and integer-cents money
- legacy v5 migration
- bounded cursor-shaped repositories
- idempotent checkout and scattered order IDs
- delivery assignment/completion concurrency protection
- Owner/Admin authority separation and last-Owner invariant
- durable support handover history
- targeted merchant quality refresh
- expiring current driver-location snapshot
- cumulative refund protection
- 10,000-merchant / 20,000-order bounded-page sanity test
- v6.0 → v6.1 browser-state migration
- promotion / tip / scheduled checkout pricing
- tenant-scoped merchant catalogue maintenance
- merchant / driver / waitlist intake queues
- audited Admin driver administration
- merchant storefront deep-links and QR adapter
- Owner-only brand/social authority
- bounded searchable Admin order oversight

## Static / production-boundary tests — 8 passed

- JavaScript syntax
- relative import resolution
- repository boundary enforcement in views
- v6.1.1 package identity and JSON parsing
- unique shell IDs and local asset resolution
- no active UI prototype/demo labels
- production enforcement artefacts and server command contracts
- service-worker / manifest asset integrity

## Visible UI contract tests — 7 passed

- branded header, Explore GoodKota and actor-context strip
- orange GoodKota customer hero and branded active navigation
- merchant workspace exposes order details, menu maintenance and storefront QR
- GoodKota Admin and GoodKota Owner are visually separate workspaces
- public website includes Kota Culture, promotions, merchant/driver intake and waitlist
- dialog behaviour retains stable viewport sizing with no scale-based navigation
- Admin overview summary is passed explicitly and cannot fail on the previous out-of-scope reference

## Runtime render smoke tests — 9 passed

Primary views render without a JavaScript runtime exception for:

- Customer
- Merchant
- Driver
- Delivery Ops
- GoodKota Admin
- GoodKota Owner

Secondary render coverage also passes for Customer Home/Browse/Orders/Cart/Account, all GoodKota Admin sections, and all GoodKota Owner sections.

During this pass two runtime defects not caught by the prior v6.1 static suite were corrected:

1. GoodKota Admin Overview referenced its materialized merchant summary outside the function scope.
2. Delivery Ops driver-fleet rendering referenced an order variable that had not been resolved in that scope.

## Browser automation limitation

Chromium is installed in the execution environment but does not complete even a local headless navigation here, so a true rendered-browser screenshot/click test cannot be certified from this container. The runtime-render suite above was added specifically to catch view-level JavaScript failures despite that limitation. A normal Chrome visual smoke test on the target machine remains appropriate before deployment.
