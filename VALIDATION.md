# Yagoya v6.2 — Brand Transition Validation

## Result

**44 / 44 automated tests passed.**

This release carries the validated v6.1.2 product, governance and scale foundation into the official Yagoya identity. The established visual identity is preserved, the active logo/splash assets are now Yagoya-named, and customer/public positioning now leads with **“We tell you where the good food is.”**

## Transition checks

- All active product-facing `GoodKota` naming has been replaced with `Yagoya`.
- Customer, Merchant, Driver, Delivery Ops, Yagoya Admin and Yagoya Owner render without runtime exceptions.
- The persistent header logo remains visible on narrow screens.
- The public website uses Yagoya positioning while retaining Kota Culture as an important content/category pillar.
- Existing `goodkota_integrated_v6_1` browser collections migrate into `yagoya_integrated_v6_2` on first load.
- Legacy internal delivery/provider values such as `goodkota_fleet` remain supported as compatibility identifiers so historical delivery records retain meaning. These values are not surfaced as the customer-facing brand.
- JavaScript syntax, relative imports, repository boundaries, HTML IDs, local asset references, manifest/service-worker assets, governance invariants, bounded repositories, idempotent checkout, concurrency protection, refund protection and scale sanity tests all pass.

## Automated suites

- Scale / integrity: **19 passed**
- Static / production boundary: **8 passed**
- Visible UI contracts: **8 passed**
- Runtime rendering: **9 passed**

# Yagoya v6.1.2 Logo Restoration — Validation

This point release fixes the responsive header regression that could hide the official Yagoya logo on narrow viewports. The logo is now explicitly preserved at every breakpoint while the wordmark alone may collapse for space. A regression test rejects any blanket `.brand span { display:none }` rule.

# Yagoya v6.1.1 Visible UI Rollup — Validation

## Result

**43 / 43 automated tests passed.**

The v6.1.1 correction retains the v6.1 data schema and scale foundation while making the previously agreed Yagoya UI changes visibly present in the packaged application.

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

- branded header, Explore Yagoya and actor-context strip
- orange Yagoya customer hero and branded active navigation
- merchant workspace exposes order details, menu maintenance and storefront QR
- Yagoya Admin and Yagoya Owner are visually separate workspaces
- public website includes Kota Culture, promotions, merchant/driver intake and waitlist
- dialog behaviour retains stable viewport sizing with no scale-based navigation
- Admin overview summary is passed explicitly and cannot fail on the previous out-of-scope reference

## Runtime render smoke tests — 9 passed

Primary views render without a JavaScript runtime exception for:

- Customer
- Merchant
- Driver
- Delivery Ops
- Yagoya Admin
- Yagoya Owner

Secondary render coverage also passes for Customer Home/Browse/Orders/Cart/Account, all Yagoya Admin sections, and all Yagoya Owner sections.

During this pass two runtime defects not caught by the prior v6.1 static suite were corrected:

1. Yagoya Admin Overview referenced its materialized merchant summary outside the function scope.
2. Delivery Ops driver-fleet rendering referenced an order variable that had not been resolved in that scope.

## Browser automation limitation

Chromium is installed in the execution environment but does not complete even a local headless navigation here, so a true rendered-browser screenshot/click test cannot be certified from this container. The runtime-render suite above was added specifically to catch view-level JavaScript failures despite that limitation. A normal Chrome visual smoke test on the target machine remains appropriate before deployment.
