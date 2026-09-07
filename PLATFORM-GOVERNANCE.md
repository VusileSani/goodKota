# Yagoya Platform Governance

## Authority model

Yagoya separates company ownership from day-to-day platform operations.

```text
Yagoya Owner
  -> Yagoya Admin
      -> Delivery Ops
      -> Merchant
      -> Driver
      -> Customer
```

### Yagoya Owner

Owner authority governs Yagoya itself. It is not a larger version of Admin.

Owner controls:
- who can hold Owner or Admin authority
- maintenance mode
- customer ordering availability
- payment availability
- delivery availability
- merchant onboarding availability
- full privileged audit and integrity overview

Invariants:
- Yagoya must always retain at least one active Owner.
- Admin cannot grant, revoke or change Owner authority.
- Owner-level control changes require a reason and are written to the privileged audit.
- financial history, order history and audit history are append-oriented; operational corrections should be represented as new events rather than silent historical rewrites.

### Yagoya Admin

Admin is an internal Yagoya employee role responsible for continuity of day-to-day platform operations.

Admin can:
- onboard and maintain merchants
- manage merchant compliance
- manage merchant commercial/subscription status
- perform reason-coded merchant operating interventions
- manage Yagoya Standard quality interventions
- receive, assign and resolve support cases
- publish and close platform announcements
- see operational activity history for staff handover

Admin cannot:
- grant or remove Owner authority
- change protected Owner-level company controls
- erase privileged audit history

### Delivery Ops

Delivery Ops remains operationally narrow: assignment and monitoring of delivery tasks and drivers. It should not inherit merchant, financial or company-governance authority.

## Production enforcement

The actor selector in this browser build is for product testing only. Production must enforce authority with Firebase Authentication, server-issued custom claims, Firestore/Realtime Database Security Rules and Cloud Functions for privileged transitions.

Recommended claims include:
- `goodkotaOwner: true`
- `goodkotaAdmin: true`
- `deliveryOps: true`
- merchant-scoped and driver-scoped identifiers/roles

Owner/Admin claims must only be created or changed by a trusted server-side environment. High-risk changes should be server-authoritative and auditable.

## Support continuity

Support cases and operational audit history exist so stakeholder support does not depend on one founder, developer or employee being available. A case remains in the Yagoya queue until resolved and can be handed from one authorized employee to another with the previous context intact.

## Merchant location

Merchant creation accepts any real South African street address. The browser build can resolve the address to latitude/longitude using an address lookup and also permits manual coordinates when lookup is unavailable. Production should replace the public lookup with the selected geocoding provider, persist geohashes, and validate service radius server-side.

## v6.1 operating extensions

Yagoya Admin now also owns the day-to-day queues for merchant applications, driver applications, driver administration, promotions and bounded cross-merchant order oversight. These remain operational powers and do not confer ownership authority.

Yagoya Owner additionally governs the official public brand configuration (public website and official social channels). Admin cannot change this Owner-only company identity control.

Public merchant/driver/waitlist submissions are intake records, not authority grants. Approval never automatically creates platform staff authority. Merchant and driver onboarding remain explicit Admin operations with their own audit events.
