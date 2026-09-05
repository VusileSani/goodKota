# GoodKota V1.0 Architecture

## Product boundary

GoodKota is a marketplace. It connects customers to independent merchants while preserving each merchant as the owner/operator of its store, catalogue and order fulfilment.

## Core entities

### Merchant
Stable marketplace identity for a store.

Important states:
- `platformStatus`: whether GoodKota permits the merchant to participate.
- `isOpen`: whether the merchant is currently taking orders.
- `subscriptionStatus`: commercial access state.

These must remain separate.

### Menu Item
Owned by one merchant. Products can be disabled without deleting history.

### Order
An immutable commercial snapshot plus a controlled operational lifecycle.

Order items store a snapshot of:
- menu item ID
- item name
- unit price
- quantity

This prevents future catalogue edits from changing historical orders.

### Order lifecycle

Collection:

`PENDING → ACCEPTED → PREPARING → READY → COMPLETED`

Delivery:

`PENDING → ACCEPTED → PREPARING → READY → DISPATCHED → COMPLETED`

A pending order can be rejected. Every transition appends a timestamp to `statusHistory`.

### Subscription
Commercial access is represented independently from store availability. V1.0 intentionally does not define final GoodKota pricing.

## Future service boundaries

A production build can evolve toward:

```text
Identity / Auth
      ↓
Marketplace API
 ├── Merchant Service
 ├── Catalogue Service
 ├── Order Service
 ├── Promotion Service
 ├── Subscription Service
 └── Notification Service
      ↓
Operational Database
      ↓
Payments / Delivery / Messaging integrations
```

The prototype does not need those services physically separated yet. The code boundaries merely make later extraction straightforward.
