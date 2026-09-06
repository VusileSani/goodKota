# GoodKota delivery architecture — v4.2

## Core principle

Delivery is a separate operational domain connected to an order through a `deliveryTask`. A merchant remains the store fulfilling the food order; driver-specific state does not belong in the order or merchant document.

## Boundaries

### Order domain owns

- customer
- merchant
- items
- payment state
- requested fulfilment type
- delivery destination request

### Delivery domain owns

- provider/fleet selection
- dispatch state
- driver assignment
- current driver location
- pickup/drop-off state
- ETA
- delivery events
- proof of delivery

### Payment domain owns

- transaction confirmation
- provider reference
- merchant settlement identity
- future food/delivery fee accounting

## Provider adapter contract

A future external courier adapter should conceptually implement:

```text
createJob(deliveryTask)
cancelJob(deliveryTask)
getJob(externalJobId)
translateWebhook(providerEvent) -> GoodKota delivery event/status
```

GoodKota should expose stable internal delivery statuses even if providers use different terminology.

## Dispatch evolution

The foundation ranks eligible available drivers by straight-line distance to the merchant after the merchant marks food ready.

Future scoring can include:

```text
score =
  pickupETA
  + predictedMerchantWait
  + deliveryETA
  + workloadPenalty
  + SLA risk
  + vehicleConstraint
  + providerCost
```

## Tracking

Driver location is ephemeral operational data. Durable evidence comes from delivery events and proof-of-delivery records.

```text
native/hybrid driver app
  → authenticated location update
  → current driver location snapshot
  → assigned customer receives relevant tracking
  → operations receives authorized fleet view
  → raw location expires after short retention
```

## Geofencing

A future driver app can define geofences around:

- merchant pickup point
- customer delivery point

They may suggest `at_pickup` and `arriving` states while explicit pickup/proof-of-delivery confirmation remains required for consequential transitions.

## Proof of delivery

Default recommendation: customer PIN.

Possible later alternatives include customer QR confirmation, signature, photo evidence where appropriate, or trusted geofence plus customer acknowledgement. Use the least intrusive method that resolves disputes reliably.

## Analytics enabled by delivery events

- order-ready → driver-assigned time
- driver-assigned → merchant-arrival time
- merchant-arrival → pickup time
- pickup → delivered time
- total delivery SLA
- merchant waiting delay
- driver cancellation/reassignment rate
- delivery failure cause
- driver quality
- provider cost/performance
