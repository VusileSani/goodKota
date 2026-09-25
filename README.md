# GoodKota MVP v10

An orange, premium pickup ordering prototype built from the v9 customer experience and the operational workflows in the supplied full-spectrum source. The customer screens lead with food and merchant listings. Product tiles and merchant cards have picture placeholders until actual merchant photos are available.

## Run locally

Serve **this directory** over HTTP (ES modules require it):

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Use the workspace selector in the header to inspect Customer, Merchant and GoodKota views. All three views share state within one browser profile for demonstration.

## Main journey

1. In Customer → Account, submit a merchant application with the pickup address and contact details.
2. In GoodKota → Applications, review and approve it. The new listing starts offline in **review**.
3. In Merchant, select the new spot. In Menu, add a kota and optional paid extras or free ingredient removals. Set store details and availability of each item.
4. In GoodKota → Quality, record the five checks with a review note. In Merchants, activate the listing with a reason.
5. In Merchant → Orders, open the listing for orders. In Customer → Discover, choose an item and its options, adjust quantities in the cart, enter contact details, and place a pickup order. The menu and total are rechecked before the browser records the order.
6. In Merchant → Orders, accept, mark ready and mark collected, or cancel with a reason. Customer → Orders shows the status, contents, pickup directions and cancellation reason. GoodKota → Orders provides oversight.
7. Merchant → Support opens cases. GoodKota → Support records progress and a handover note. GoodKota → Reports filters dated orders and exports a CSV; Activity shows recent actions.

The checkout uses **pay on collection** and records the payment state as `unpaid`. Customer name, phone and email are captured for the order. `docs/PAYFAST-INTEGRATION.md` describes the backend and provider contract for later PayFast integration.

## Scope and honest limits

- Delivery, drivers, dispatch, promotions, settlement and the wider full-spectrum modules are outside this pickup build.
- Seed merchants, ratings and distances are illustrative. Their starting addresses identify areas, so navigation opens those areas until a merchant enters a real street address.
- The workspace selector is a demonstration control, **not authentication or role enforcement**. Browser localStorage is local to one device and is not shared order delivery, durable business data, or secure storage for real customer details. This build must not be used to take real public orders or collect real customer data.
- No PayFast transaction is offered or charged. PayFast needs an authenticated server, trusted pricing and order storage, signed hosted checkout setup, and validated notifications before it can be switched on.
- Existing v9 browser state is reused where present. A fresh browser profile starts from the sample merchants. To demo a brand new listing, use the application journey above.

## Updating GitHub Pages

Extract the ZIP and copy its **contents** to the configured Pages publishing branch and folder. Commit and push the changed files, including `js/views/admin-view.js` and `js/core/operations.js`. Pushing only the ZIP leaves the public app unchanged. After the Pages deployment completes, reload; the service-worker cache name is bumped to v10, though a hard reload or clearing site data may be needed once if an older worker still controls the tab.

Run `npm test` for integrity and workflow checks.
