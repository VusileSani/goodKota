# GoodKota Foundation v4.3 — Customer Navigation Pass

Foundation v4.3 retains the simplified merchant model from v4.2 and rebuilds the customer-facing ordering journey around fast, phone-first navigation.

## Customer-facing navigation

The customer view now follows a compact mobile hierarchy:

```text
location
  → nearby merchants
  → selected merchant menu
  → persistent order/cart
  → checkout / orders
```

- location stays visible with a simple Change action
- merchant cards are fully tappable
- menu search is prominent
- categories wrap inside the phone width rather than creating a horizontal page
- product cards are fully tappable, with a direct add control
- a persistent customer nav provides Home, Browse, Orders, Cart and Account
- a persistent order bar keeps the current cart visible while browsing
- checkout remains progressively disclosed rather than crowding the menu

The customer navigation was informed by the useful interaction patterns in the supplied Mugg & Bean, Nando's and KFC screenshots while keeping GoodKota's own restrained visual system.

## Overlay behaviour

Opening any GoodKota dialog now locks the underlying document at its exact scroll position. The dialog itself remains vertically scrollable, while touch/wheel interaction cannot move the page behind it. Closing the dialog restores the previous page position.

## Core simplification

A **Merchant is the actual operating store/location**. One merchant record now owns:

- trading and legal name
- contact details
- physical address, area and coordinates
- operating status
- compliance status and Office note
- preparation time
- minimum order
- delivery fee, radius and provider preference
- settlement/gateway identity
- GoodKota quality workflow and rating summary
- catalogue and orders through `merchantId`

There is no separate `outlets` collection and orders no longer carry `outletId`.

If GoodKota later needs to represent several stores under one brand or legal group, add an optional higher-level Brand/Group entity above merchants. Do not reintroduce a mandatory Merchant → Outlet hierarchy.

## GoodKota Office

- Merchant rows are fully interactive.
- **Add merchant** creates the operating store in one form.
- Existing merchants can be edited from one detail view.
- Office can change compliance status independently of settlement verification and quality workflow.
- Office can enable/disable merchants and manage quality intervention states.
- Location, operations and delivery configuration are all edited on the merchant itself.

## Mobile-width invariant

Foundation v4.3 continues to enforce phone-width usability:

- no intentional horizontal page scrolling
- operational tables collapse into labelled vertical records on narrow screens
- forms collapse to one column
- dialogs remain inside the viewport
- long references, addresses and status text wrap rather than expand the page
- header navigation wraps into a compact grid
- controls and buttons stay within their container width

This is a product constraint: future screens should preserve the same invariant.

## Foundations retained

1. **Location-first discovery** — merchants carry coordinates and eligible merchants are ranked by distance.
2. **GoodKota Standard** — verified GoodKota orders feed merchant food/service quality monitoring.
3. **Direct merchant settlement** — the payment provider can settle the verified merchant account directly.
4. **Delivery as a separate operational domain** — delivery tasks, assignments, drivers, location snapshots, events and proof of delivery remain separate from food orders.
5. **Hybrid delivery support** — GoodKota fleet, merchant fleet and future third-party adapters use one delivery-task contract.
6. **Customer PIN proof of delivery** — the prototype demonstrates final handover confirmation without exposing a production credential model.

## Order and delivery flow

```text
customer pays
  → order is submitted to merchant
  → merchant accepts
  → merchant prepares
  → merchant marks ready
  → delivery task becomes dispatchable (for delivery orders)
  → eligible driver assigned
  → driver travels to merchant
  → pickup confirmed
  → customer sees tracked delivery state
  → customer PIN confirms handover
  → delivery and order complete
```

## Architecture

```text
index.html
css/
  styles.css
js/
  app.js
  core/
    store.js
    utils.js
  data/
    seed.js
  services/
    location-service.js
    notification-service.js
    payment-service.js
    quality-service.js
    delivery-service.js
  views/
    customer-view.js
    merchant-view.js
    driver-view.js
    delivery-ops-view.js
    admin-view.js
service-worker.js
manifest.webmanifest
assets/
  goodkota-logo.png
  goodkota-splash.jpg
  goodkota-logo-print.pdf
FIREBASE-SCHEMA.md
DELIVERY-ARCHITECTURE.md
```

## Compatibility with v4/v4.1 browser data

The local `AppStore` includes a one-time compatibility migration. Older browser state that still contains merchants plus outlets is flattened into the v4.2+ merchant model. A previous extra outlet becomes its own merchant location and shared catalogue items are copied to that merchant as needed.

## Recommended production stack

Firebase Authentication + Cloud Firestore + Cloud Functions + Firebase Cloud Messaging.

Production rules should enforce role-based access, server-side payment verification, permitted order/delivery state transitions, restricted driver-location reads and short retention of raw operational location data.
