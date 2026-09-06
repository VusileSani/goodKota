# GoodKota delivery architecture

## Core principle

Delivery is an add-on operational domain connected to an order through a `deliveryTask`. The order does not become a giant courier object.

This preserves GoodKota's ability to add or change fulfilment providers without changing customer checkout, merchant catalogue, ratings or payment concepts.

## Boundaries

### Order domain owns

- customer
- merchant/outlet
- items
- payment state
- requested fulfilment type
- delivery destination request

### Delivery domain owns

- provider/fleet selection
- dispatch state
- driver assignment
- current driver location
- pickup/dropoff state
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

GoodKota should continue to expose its own stable delivery statuses to customers and merchants even if different providers use different terminology.

## Dispatch evolution

This foundation ranks available eligible drivers by straight-line distance to the outlet after the outlet marks the food ready.

Future dispatch scoring can become:

```text
score =
  pickupETA
  + predictedOutletWait
  + deliveryETA
  + workloadPenalty
  + SLA risk
  + vehicleConstraint
  + providerCost
```

The lowest/most suitable score wins, subject to business rules.

## Tracking

Driver location should be treated as ephemeral operational data. Durable business evidence comes from delivery events and proof-of-delivery records.

Recommended future pattern:

```text
Native/hybrid driver app
  → authenticated location update
  → Firestore current driver location / realtime transport
  → customer receives only assigned delivery tracking
  → operations dashboard receives authorized fleet view
  → raw location expires after short retention
```

## Geofencing

The driver app can later define geofences around:

- pickup outlet
- customer delivery point

These can automate suggested events such as `at_outlet` and `arriving`, while still requiring explicit pickup/proof-of-delivery confirmation for consequential transitions.

## Proof of delivery

Default recommendation: customer PIN.

Possible later alternatives:

- customer QR confirmation
- signature
- photo evidence where appropriate
- trusted geofence + customer acknowledgement

Use the least intrusive method that resolves disputes reliably.

## Analytics enabled by delivery events

- order-ready → driver-assigned time
- driver-assigned → outlet-arrival time
- outlet-arrival → pickup time
- pickup → delivered time
- total delivery SLA
- outlet waiting delay
- driver cancellation/reassignment rate
- delivery failure cause
- driver quality
- provider cost/performance

These metrics can later inform driver deployment zones and how many drivers GoodKota needs by area/time of day.
