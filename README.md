# GoodKota Foundation v3 — Delivery Ready

Foundation v3 keeps the approved GoodKota foundations from v2 and adds a clean delivery/driver domain without turning orders, merchants or customer tracking into courier-specific code.

## Product foundations retained

1. **Location-first discovery** — physical outlets carry coordinates and customer discovery ranks the closest eligible outlet first.
2. **Merchant/outlet separation** — merchants are businesses; outlets are physical operating locations.
3. **GoodKota Standard** — verified-order ratings feed quality monitoring and a GoodKota Office intervention workflow.
4. **Direct merchant settlement** — GoodKota controls the payment integration; verified merchant gateway identities receive settlement directly.
5. **Notification-ready PWA** — foreground location and browser push are supported conceptually; true pass-by geofencing remains a native/hybrid future phase.

## New in v3: delivery as its own domain

The application now models delivery separately from the food order.

```text
paid order
  → outlet accepts
  → outlet prepares
  → outlet marks ready
  → delivery task becomes dispatchable
  → eligible driver assigned
  → driver travels to outlet
  → pickup confirmed
  → customer sees tracked delivery state
  → driver approaches customer
  → customer PIN confirms handover
  → delivery closes
  → order completes
  → driver becomes available again
```

### Delivery entities

```text
drivers
 driverVehicles
 driverLocations          # current operational snapshot
deliveryTasks            # one fulfilment job
deliveryAssignments      # auditable driver/task assignment
deliveryEvents           # durable operational timeline
proofsOfDelivery         # delivery confirmation evidence
```

This deliberately avoids stuffing driver-specific state inside the order document.

## Fleet models already anticipated

Each `deliveryTask` has a `providerType`. The same task contract can therefore support:

- `goodkota_fleet` — GoodKota-operated drivers
- `merchant_fleet` — outlet/merchant-operated drivers
- future third-party courier adapters

The current demo includes both GoodKota drivers and a merchant-owned driver.

## Prototype surfaces

- **Customer** — closest outlet discovery, checkout, delivery task creation and delivery tracking
- **Merchant** — accepts/prepares orders and marks delivery orders ready for dispatch
- **Driver** — future driver-app workflow, job progression, simulated GPS snapshots and customer PIN proof of delivery
- **Delivery Ops** — dispatch queue, best-driver recommendation, fleet state and delivery monitoring
- **GoodKota Office** — quality, merchant settlement, outlet governance and delivery governance

## Dispatch rule in this foundation

A delivery cannot be assigned until the outlet marks the order **ready**. Once ready, the demo filters eligible available drivers by fleet/provider compatibility and ranks them by distance to the pickup outlet.

Production scoring can later add:

- predicted food-ready time
- traffic/travel ETA
- driver current workload
- vehicle type
- delivery SLA
- route batching
- driver acceptance behaviour
- merchant-specific fleet rules

The dispatch algorithm is therefore a replaceable service policy, not embedded in the order model.

## Tracking model

Foundation v3 uses two deliberately different records:

1. **Current driver location snapshot** — mutable operational state for live tracking.
2. **Delivery events** — durable business events such as assigned, arrived, picked up, en route and delivered.

This is intentional. Production GoodKota does not need a permanent high-frequency history of every metre a driver travels. Driver GPS should be active only during relevant shift/job conditions and raw location retention should be short.

## Proof of delivery

The demo uses a 4-digit customer PIN. The local prototype stores a readable PIN purely so the workflow can be tested.

**Production rule:** GoodKota should store/verify a hashed or short-lived server-side delivery credential. The driver application must never be able to read the expected PIN.

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
assets/icon.svg
FIREBASE-SCHEMA.md
DELIVERY-ARCHITECTURE.md
```

`AppStore` remains the browser-local demo repository. The views and delivery policy are isolated so Firestore repositories can replace it without rewriting the product flows.

## Recommended production stack

Use **Firebase Authentication + Cloud Firestore + Cloud Functions + Firebase Cloud Messaging**.

Near-term driver tracking should be implemented in a native/hybrid driver application because reliable background location while the screen is locked is not a good fit for an ordinary browser experience.

## Production payment invariant

```text
customer checkout
  → GoodKota backend creates provider transaction
  → gateway processes payment
  → signed gateway webhook reaches Cloud Function
  → server verifies amount/reference/signature
  → payment becomes paid
  → order is submitted
  → gateway settles merchant according to configured marketplace account
```

Browser success alone must never mark an order paid.

## Running locally

Foundation v3 uses ES modules, so serve it over HTTP:

```bash
cd goodkota-foundation-v3
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Suggested demo walkthrough

1. Open **Customer** and inspect the seeded tracked Home Delivery order `GK2003`.
2. Open **Driver**, choose Neo M. and advance the active delivery until `Arriving`.
3. Return to **Customer → Track delivery** and note the updated event timeline and delivery PIN.
4. In **Driver**, complete the handover using the PIN.
5. Place a new **Home Delivery** order from Customer.
6. In **Merchant**, accept it and mark it ready.
7. In **Delivery Ops**, assign the recommended eligible driver.
8. In **Driver**, progress the new job.

## Next production pass

1. Create/configure the GoodKota Firebase project.
2. Replace `AppStore` with Firestore repository modules.
3. Add Firebase Authentication and role-based access for customer, merchant, office, dispatcher and driver.
4. Add Security Rules and Cloud Functions enforcing order/payment/delivery transitions.
5. Select the South African marketplace payment gateway and implement its provider adapter + verified webhook.
6. Add real geocoding/geohash queries and service-radius validation.
7. Add FCM transactional order/delivery notifications.
8. Build the driver app shell with authenticated background GPS and controlled location retention.
9. Add route/traffic ETA provider and dispatch scoring.
10. Add driver/delivery quality metrics separately from kota/outlet quality.
