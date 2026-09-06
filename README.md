# GoodKota Foundation v4 — Branded Operations

Foundation v4 keeps the approved GoodKota architecture and applies the official brand assets plus the latest operational UI decisions.

## What changed in v4

- Official GoodKota logo is now used in the application shell and PWA icon.
- Official orange patterned artwork is used for the launch splash screen.
- Brand primary colour is derived from the supplied logo: `#F15A29`.
- Operational screens were reduced to information and actions that serve the current task.
- GoodKota Office now has a clear **Add merchant** flow. The common one-outlet case creates the merchant and primary outlet together in one form while preserving separate backend entities.
- Multi-outlet merchants use **Add another outlet** from merchant detail.
- Merchant orders now have an explicit **Open** action and order ID link. Full order details use progressive disclosure for secondary information.
- Existing location-first discovery, verified quality, payment invariants, delivery-task separation, dispatch, tracking and proof-of-delivery foundations are retained.

## Product foundations

1. **Location-first discovery** — physical outlets carry coordinates and eligible outlets are ranked by distance.
2. **Merchant/outlet separation** — merchant = business; outlet = physical operating location.
3. **GoodKota Standard** — verified order ratings feed quality monitoring and Office intervention.
4. **Direct merchant settlement** — production payment state must be confirmed server-side; merchant settlement identity remains provider-managed/tokenised where possible.
5. **Separate delivery domain** — orders own the purchase and requested fulfilment; delivery tasks own dispatch, driver assignment, tracking events and proof of delivery.
6. **Minimal operational UI** — secondary implementation/architecture detail stays out of normal user screens.

## Core delivery flow

```text
paid order
  → outlet accepts
  → outlet prepares
  → outlet marks ready
  → delivery task becomes dispatchable
  → eligible driver assigned
  → pickup
  → tracked delivery
  → customer PIN handover
  → order completes
```

## Architecture

```text
index.html
css/styles.css
js/app.js
js/core/store.js
js/core/utils.js
js/data/seed.js
js/services/location-service.js
js/services/notification-service.js
js/services/payment-service.js
js/services/quality-service.js
js/services/delivery-service.js
js/views/customer-view.js
js/views/merchant-view.js
js/views/driver-view.js
js/views/delivery-ops-view.js
js/views/admin-view.js
assets/goodkota-logo.png
assets/goodkota-splash.jpg
assets/goodkota-logo-print.pdf
manifest.webmanifest
service-worker.js
FIREBASE-SCHEMA.md
DELIVERY-ARCHITECTURE.md
```

`AppStore` is still the browser-local prototype repository. The product boundaries remain structured so Firestore repositories can replace it without rewriting the views.

## Recommended production stack

Firebase Authentication + Cloud Firestore + Cloud Functions + Firebase Cloud Messaging. True background driver GPS remains a native/hybrid driver-app concern.

## Production invariants

- Browser payment success never marks an order paid; a trusted server-side gateway webhook must verify it.
- A delivery cannot be assigned before the outlet marks the order ready.
- Only the assigned driver may progress consequential delivery steps.
- Delivery completion requires server-verified proof of delivery.
- Driver location is short-lived operational data; durable history comes from delivery events and proof-of-delivery records.
- Delivery quality should remain separate from food/outlet quality.

## Run locally

Because the build uses ES modules, serve it over HTTP:

```bash
cd goodkota-foundation-v4
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Suggested walkthrough

1. Open **GoodKota Office** → **Add merchant** and create a merchant plus its primary outlet.
2. Open that merchant to confirm the outlet is separate and use **Add another outlet** if required.
3. Open **Merchant** and click **Open** on an order to review the complete order detail.
4. Accept/prepare the order and mark a delivery order ready.
5. Open **Delivery Ops** to assign the recommended eligible driver.
6. Progress the job in **Driver**, then confirm the customer PIN.
7. Return to **Customer** to see tracking/completion and submit a verified rating.

## Next production pass

1. Create/configure the GoodKota Firebase project.
2. Replace `AppStore` with Firestore repositories.
3. Add Authentication and role-based access.
4. Add Security Rules and Cloud Functions enforcing order/payment/delivery transitions.
5. Select the South African marketplace payment gateway and implement the provider adapter + verified webhook.
6. Add real geocoding/geohash queries and service-radius validation.
7. Add FCM transactional notifications.
8. Build the authenticated native/hybrid driver shell for background GPS.
9. Add route/traffic ETA scoring.
10. Add delivery/driver quality metrics separately from kota/outlet quality.
