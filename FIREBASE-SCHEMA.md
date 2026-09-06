# GoodKota Firebase data contract — Foundation v4

Target stack: Firebase Authentication + Cloud Firestore + Cloud Functions + Firebase Cloud Messaging.

## Core collections

```text
users/{userId}
merchants/{merchantId}
outlets/{outletId}
products/{productId}
orders/{orderId}
ratings/{ratingId}
payments/{paymentId}
qualityCases/{caseId}
notificationSubscriptions/{subscriptionId}
promotions/{promotionId}

drivers/{driverId}
driverVehicles/{vehicleId}
driverLocations/{driverId}
deliveryTasks/{taskId}
deliveryAssignments/{assignmentId}
deliveryEvents/{eventId}
proofsOfDelivery/{proofId}
```

## Merchant

```json
{
  "name": "Kasi Bites Group",
  "legalName": "Kasi Bites (Pty) Ltd",
  "primaryOutletId": "o1",
  "contact": { "email": "owner@example.com" },
  "enabled": true,
  "deliveryCapability": {
    "ownDrivers": false,
    "acceptsGoodKotaFleet": true,
    "thirdPartyAllowed": true
  },
  "gatewayAccount": {
    "provider": "provider-name",
    "externalAccountId": "sub_xxx",
    "status": "verified"
  },
  "settlementStatus": "verified"
}
```

Sensitive bank data should preferably be collected/tokenised by the payment provider. GoodKota stores safe provider identifiers and verification state when possible.

### Office onboarding rule

The normal Office flow creates a merchant and its first physical outlet in one user action, while persisting them as separate documents:

```text
Add Merchant form
  → create merchants/{merchantId}
  → create outlets/{primaryOutletId} with merchantId
  → set merchants/{merchantId}.primaryOutletId
```

Additional outlets are created later from the merchant detail view. Do not duplicate outlet location or operational fields inside the merchant document.

## Outlet

```json
{
  "merchantId": "m1",
  "name": "Kasi Bites Midrand",
  "address": "...",
  "latitude": -25.9992,
  "longitude": 28.1263,
  "geohash": "...",
  "enabled": true,
  "prepMinutes": 18,
  "deliveryFeeCents": 2400,
  "minOrderCents": 3500,
  "delivery": {
    "enabled": true,
    "radiusKm": 8,
    "providerPreference": "goodkota_fleet"
  },
  "qualityWorkflow": {
    "status": "healthy",
    "note": ""
  }
}
```

## Order

```json
{
  "customerId": "uid",
  "merchantId": "m1",
  "outletId": "o1",
  "paymentStatus": "paid",
  "status": "accepted",
  "fulfilment": {
    "type": "delivery",
    "provider": "goodkota_fleet",
    "destination": {
      "address": "...",
      "latitude": -26.0072,
      "longitude": 28.1205
    }
  },
  "createdAt": "server timestamp"
}
```

Orders describe what was purchased and the requested fulfilment. Driver lifecycle state belongs in `deliveryTasks`, not in the order.

## Driver

```json
{
  "name": "Neo M.",
  "operatorType": "goodkota",
  "operatorId": "goodkota",
  "enabled": true,
  "shiftStatus": "online",
  "availability": "available",
  "vehicleId": "v1",
  "activeTaskId": null,
  "trackingConsent": true,
  "rating": 4.9,
  "completedDeliveries": 184
}
```

For a merchant driver, `operatorType = merchant` and `operatorId = merchantId`.

## Driver vehicle

```json
{
  "driverId": "d1",
  "type": "motorbike",
  "registration": "ABC123GP",
  "enabled": true
}
```

## Current driver location

Use one current snapshot document per driver rather than writing every GPS sample into a permanent history.

```json
{
  "driverId": "d1",
  "latitude": -26.0028,
  "longitude": 28.1232,
  "geohash": "...",
  "accuracyMeters": 14,
  "heading": 220,
  "recordedAt": "server timestamp",
  "activeTaskId": "dt1"
}
```

Apply strict read rules: only the assigned customer/order context, authorized operations users and appropriate merchant/driver roles should see relevant location data. Apply TTL/retention policy where appropriate.

## Delivery task

```json
{
  "orderId": "GK3001",
  "merchantId": "m1",
  "outletId": "o1",
  "providerType": "goodkota_fleet",
  "status": "ready_for_dispatch",
  "assignedDriverId": null,
  "assignmentId": null,
  "deliveryFeeCents": 2400,
  "pickup": {
    "address": "Kasi Bites Midrand",
    "latitude": -25.9992,
    "longitude": 28.1263
  },
  "dropoff": {
    "address": "...",
    "latitude": -26.0072,
    "longitude": 28.1205
  },
  "verification": {
    "method": "pin",
    "credentialHash": "server-only hash"
  },
  "createdAt": "server timestamp",
  "readyAt": "server timestamp",
  "assignedAt": null,
  "pickedUpAt": null,
  "estimatedArrivalAt": null,
  "deliveredAt": null
}
```

Recommended status progression:

```text
awaiting_prep
→ ready_for_dispatch
→ assigned
→ driver_to_outlet
→ at_outlet
→ picked_up
→ en_route
→ arriving
→ delivered
```

`cancelled` is a terminal exception state.

## Delivery assignment

```json
{
  "taskId": "dt1",
  "driverId": "d1",
  "providerType": "goodkota_fleet",
  "status": "active",
  "assignedBy": "dispatcherUid",
  "assignedAt": "server timestamp",
  "completedAt": null
}
```

Keep assignments immutable/auditable enough to reconstruct reassignment history.

## Delivery event

```json
{
  "taskId": "dt1",
  "type": "pickup_confirmed",
  "message": "Order collected from outlet",
  "actorType": "driver",
  "actorId": "d1",
  "createdAt": "server timestamp",
  "metadata": {}
}
```

Events are the durable source for customer tracking timelines and delivery analytics.

## Proof of delivery

```json
{
  "taskId": "dt1",
  "orderId": "GK3001",
  "driverId": "d1",
  "method": "customer_pin",
  "confirmedAt": "server timestamp",
  "confirmationLocation": {
    "latitude": -26.0072,
    "longitude": 28.1205
  }
}
```

Do not store the customer's raw PIN in this document.

## Rating

```json
{
  "orderId": "GK3001",
  "outletId": "o1",
  "customerId": "uid",
  "verified": true,
  "overall": 5,
  "food": 5,
  "service": 4,
  "comment": "Fresh and excellent",
  "createdAt": "server timestamp"
}
```

Delivery quality should later be a separate rating dimension/entity so driver/logistics problems do not distort food/outlet quality.

## Quality case

```json
{
  "outletId": "o4",
  "status": "intervention",
  "trigger": {
    "signal": "alert",
    "overall": 3.1,
    "lowRatingRate": 0.32
  },
  "issueTags": ["food_temperature", "chips_freshness"],
  "ownerAction": "Improve holding times",
  "openedAt": "server timestamp",
  "reviewAfterVerifiedOrders": 20
}
```

## Payment

```json
{
  "orderId": "GK3001",
  "merchantId": "m1",
  "outletId": "o1",
  "amountCents": 10000,
  "foodAmountCents": 7600,
  "deliveryAmountCents": 2400,
  "currency": "ZAR",
  "provider": "provider-name",
  "providerReference": "ref_xxx",
  "status": "paid",
  "settlementModel": "direct_to_merchant",
  "confirmedAt": "server timestamp"
}
```

The later commercial model may settle food proceeds to the merchant while separately accounting for delivery economics. Do not make the order schema depend on one specific fee-split arrangement.

## Server-enforced invariants

Cloud Functions / trusted backend code should enforce at least:

- browser callbacks cannot mark payments paid
- one verified rating per completed order
- suspended outlets cannot accept new GoodKota orders
- only the outlet/authorized merchant can mark its order ready
- a driver cannot hold multiple active assignments unless a future batching policy explicitly allows it
- a delivery cannot be assigned before it is dispatchable
- only the assigned driver can progress driver-controlled delivery statuses
- proof-of-delivery confirmation is server verified
- `delivered` completes the delivery and releases the driver atomically
- driver location writes are accepted only under valid authenticated shift/job conditions
