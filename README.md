# GoodKota V1.0 — Independent Marketplace Foundation

GoodKota V1.0 is a clean-room, browser-local prototype for a multi-merchant kota ordering marketplace.

The build is intentionally independent of the previous hosted platform. It contains no Jungleworks runtime dependency and no external backend dependency.

## What V1.0 proves

### Customer
- Find/select an active merchant.
- Browse a merchant-specific menu.
- Filter by category and search.
- Add products to a merchant-scoped cart.
- Choose collection or delivery where the merchant supports it.
- Apply a promotion.
- Add a tip.
- Place a simulated order.
- Track the current order lifecycle.

### Merchant
- Switch between demo merchants.
- Open/close a store operationally.
- See order/revenue indicators.
- Accept/reject incoming orders.
- Progress orders through a controlled lifecycle.
- Add catalogue items.
- Enable/disable catalogue items without deleting history.
- See the merchant's platform subscription state.

### GoodKota Admin
- See marketplace-level operational indicators.
- Add merchants.
- Suspend/reactivate platform access.
- See/cycle subscription state in the prototype.
- Add/enable/disable promotions.
- See all marketplace orders.
- See the initial subscription-plan model.

## Core business rules

1. A merchant's platform status and store-open status are separate concepts.
2. A merchant can be disabled without deleting historical orders.
3. Orders snapshot merchant name, item names, quantities and unit prices at purchase time.
4. Later catalogue changes do not rewrite historical orders.
5. Order status changes follow a controlled lifecycle and append to `statusHistory`.
6. A cart belongs to one merchant. Switching stores clears the cart after confirmation.
7. A customer cannot checkout when the store is closed or the merchant minimum order has not been reached.
8. Subscription state exists as a separate business concept from merchant operations.

## Project structure

```text
goodkota_v1_0/
├── index.html
├── README.md
├── css/
│   └── styles.css
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
└── js/
    ├── app.js
    ├── config.js
    ├── demoData.js
    ├── helpers.js
    ├── store.js
    ├── customer.js
    ├── merchant.js
    ├── admin.js
    └── domain/
        ├── orderLifecycle.js
        └── pricing.js
```

## Run locally

V1.0 uses ES modules, so serve the folder over HTTP rather than double-clicking `index.html`.

The same local PowerShell web server used for InteliMine will work. GitHub Pages will also serve the build correctly.

## Persistence

V1.0 uses browser `localStorage` deliberately. This is a prototype persistence layer, not the production architecture.

A later backend should preserve the same domain boundaries:

```text
Customer → Order → Merchant
             ↓
      Order lifecycle

Merchant → Catalogue
Merchant → Subscription
GoodKota → Marketplace administration
```

## Not yet production features

- real authentication
- payment processing
- merchant verification/KYC
- real delivery-provider integration
- maps/geocoding
- notifications
- production database
- customer accounts
- ratings/reviews
- refunds/cancellations
- real subscription billing

Those should be added incrementally after this operating flow is validated.
