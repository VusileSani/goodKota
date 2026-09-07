# GoodKota Firebase data contract — v6.0

Target stack: Firebase Authentication + Cloud Firestore + Cloud Functions + Firebase Cloud Messaging.

## Core collections

```text
users/{userId}
merchants/{merchantId}
products/{productId}
orders/{orderId}
ratings/{ratingId}
paymentTransactions/{paymentId}
paymentEvents/{eventId}
refunds/{refundId}
merchantPayouts/{payoutId}
settlementEvents/{eventId}
feeAllocations/{allocationId}
reconciliationRuns/{runId}
qualityCases/{caseId}
notificationSubscriptions/{subscriptionId}
promotions/{promotionId}
platformStaff/{staffId}
supportCases/{caseId}
supportCaseEvents/{eventId}
announcements/{announcementId}
orderEvents/{eventId}
merchantComplianceEvents/{eventId}
commercialStatusEvents/{eventId}
platformAudit/{auditEventId}
platformConfig/current

drivers/{driverId}
driverVehicles/{vehicleId}
driverLocations/{driverId}
deliveryTasks/{taskId}
deliveryCredentials/{taskId}
deliveryAssignments/{assignmentId}
deliveryEvents/{eventId}
proofsOfDelivery/{proofId}
```

## Platform governance

Platform authority is distinct from venue/merchant operations. Recommended server-issued custom claims are `goodkotaOwner` and `goodkotaAdmin`. Never allow a browser client to grant these claims to itself.

### Platform staff

```json
{
  "name": "Platform Operations",
  "email": "operations@goodkota.co.za",
  "role": "admin",
  "active": true,
  "createdAt": "server timestamp"
}
```

Only an authenticated Owner may create/change platform authority. A trusted server function must reject any change that would leave zero active Owners.

### Platform config

```json
{
  "maintenanceMode": false,
  "orderingEnabled": true,
  "paymentsEnabled": true,
  "deliveryEnabled": true,
  "merchantOnboardingEnabled": true
}
```

Protected control writes are Owner-only and must create an immutable audit event containing actor, target, old/new state, reason and server timestamp.

### Support case

```json
{
  "source": "merchant",
  "merchantId": "m1",
  "subject": "Settlement verification",
  "message": "...",
  "priority": "normal",
  "status": "open",
  "assignedTo": "staffUid",
  "resolutionNote": "",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

### Platform audit

Audit events should be append-only. Do not provide ordinary update/delete permissions on historical audit entries.

```json
{
  "actorUid": "uid",
  "actorRole": "owner",
  "action": "platform_control_changed",
  "targetType": "platform_control",
  "targetId": "paymentsEnabled",
  "reason": "Incident response",
  "before": true,
  "after": false,
  "createdAt": "server timestamp"
}
```

## Merchant

A merchant is the real operating store/location. Location and operating fields live directly on this document.

```json
{
  "name": "Kasi Bites Midrand",
  "legalName": "Kasi Bites (Pty) Ltd",
  "contact": { "email": "midrand@example.com" },
  "address": "Midrand, Gauteng",
  "area": "Midrand",
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
  "settlementStatus": "verified",
  "compliance": {
    "status": "compliant",
    "note": "GoodKota requirements verified"
  },
  "qualityWorkflow": {
    "status": "healthy",
    "note": ""
  },
  "commercial": {
    "plan": "Standard",
    "status": "active",
    "note": ""
  }
}
```

Recommended compliance values: `pending_review`, `compliant`, `needs_action`, `suspended`.

If a future business has several GoodKota stores under one brand, model the group separately (for example `brands/{brandId}`) and let each physical merchant optionally reference `brandId`.

## Product

```json
{
  "merchantId": "m1",
  "name": "Classic Kota",
  "category": "Kotas",
  "priceCents": 4800,
  "enabled": true
}
```

## Order

```json
{
  "customerId": "uid",
  "merchantId": "m1",
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

Orders describe what was bought and requested fulfilment. Driver lifecycle state belongs in `deliveryTasks`.

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

## Current driver location

Use one current snapshot per driver rather than storing every GPS sample permanently.

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

Apply strict read rules and short retention appropriate to operational location data.

## Delivery task

```json
{
  "orderId": "GK3001",
  "merchantId": "m1",
  "providerType": "goodkota_fleet",
  "status": "ready_for_dispatch",
  "assignedDriverId": null,
  "assignmentId": null,
  "deliveryFeeCents": 2400,
  "pickup": {
    "address": "Kasi Bites Midrand, Midrand, Gauteng",
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

Recommended progression:

```text
awaiting_prep
→ ready_for_dispatch
→ assigned
→ driver_to_pickup
→ at_pickup
→ picked_up
→ en_route
→ arriving
→ delivered
```

`cancelled` is terminal.


## Customer delivery credential

The delivery task contains only the server-side hash of the PIN. The customer-readable PIN is kept separately so the driver client cannot read the expected value.

```json
{
  "taskId": "dt1",
  "orderId": "orderId",
  "customerId": "uid",
  "pin": "4827",
  "createdAt": "server timestamp",
  "expiresAt": "TTL timestamp"
}
```

Security Rules allow only the owning customer to read this document. Cloud Functions create/delete it; TTL removes stale credentials. Drivers never receive read access.

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

Assignments should remain auditable enough to reconstruct reassignments.

## Delivery event

```json
{
  "taskId": "dt1",
  "type": "pickup_confirmed",
  "message": "Order collected from merchant",
  "actorType": "driver",
  "actorId": "d1",
  "createdAt": "server timestamp",
  "metadata": {}
}
```

Events provide the durable customer tracking timeline and analytics source.

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

Do not store the customer's raw production PIN in this document.

## Rating

```json
{
  "orderId": "GK3001",
  "merchantId": "m1",
  "customerId": "uid",
  "verified": true,
  "overall": 5,
  "food": 5,
  "service": 4,
  "comment": "Fresh and excellent",
  "createdAt": "server timestamp"
}
```

Delivery quality should later be a separate dimension so logistics problems do not distort merchant food/service quality.

## Production invariants

- browser-side payment success never marks an order paid without a verified server event
- disabled or quality-suspended merchants cannot accept new GoodKota orders
- only the relevant merchant/authorized merchant user can change its order preparation state
- a delivery cannot be assigned until the merchant marks the order ready
- driver location reads are restricted to authorized operations, the driver, and the assigned customer context
- delivery proof is server-verified and cannot rely on a credential readable by the driver client


## v6 operational event and retention collections

Additional production collections include `idempotencyRecords`, `jobs`, `rateLimits`, `operationalAlerts`, `analyticsEvents`, `telemetryEvents`, `merchantQualityAggregates` and materialized/aggregate documents. Ephemeral collections use TTL where appropriate; audit and financial histories are never client-deletable.

## v6.1 integrated product collections

```text
promos/{promoId}
promotionEvents/{eventId}
merchantApplications/{applicationId}
driverApplications/{applicationId}
waitlistEntries/{entryId}
driverAdministrationEvents/{eventId}
publicBrand/current
```

Public applications and waitlist entries are created through App Check protected Cloud Functions; direct Firestore writes are denied. Admin reads/reviews applications through bounded queries. Promotion and driver administration changes are written through Admin commands with event/audit records.

Merchant catalogue changes remain in `products/{productId}` and are performed through a tenant-scoped Cloud Function that verifies active `merchantMemberships` before create/update. `publicBrand/current` is a read-only public projection of Owner-controlled brand links so the public website does not need access to protected platform controls.
