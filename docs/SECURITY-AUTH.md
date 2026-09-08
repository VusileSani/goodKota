# Authentication, authority and tenancy

## Identity

Every production actor uses Firebase Authentication. Platform authority is mapped to Auth UID, never trusted from email text or the actor dropdown.

Coarse claims:
- `yagoyaOwner`
- `yagoyaAdmin`
- `deliveryOps`

Merchant access is tenant membership data (`merchantMemberships/{uid}_{merchantId}`), not a global merchant claim. Driver records map `authUid` to one driver identity.

## Privileged access

- Owner and Admin accounts require MFA.
- Only trusted server code changes platform custom claims.
- Yagoya must always retain at least one active Owner.
- Owner control/authority changes require a reason and append an immutable audit event.
- App Check is enforced on callable privileged functions.
- Client writes to payments, orders, delivery transitions, platform authority and audit are denied by Security Rules.

## Tenant isolation

Merchant users may read only orders/support/financial data for merchants where their UID has an active membership. Delivery Ops receives delivery scope, not general merchant/platform authority.

## Break-glass principle

High-risk recovery should use time-limited elevated authority in production. The permanent Admin role should not acquire Owner powers simply because an incident is inconvenient.


## v6.4 browser authentication
The browser now initializes Firebase Authentication against project `yagoya-7dad0` and supports Email/Password customer identity. Self-registration must never assign merchant, delivery, Admin or Owner authority. The Preview as selector remains a presentation/test control only; production permissions continue to derive from authenticated UID, custom claims, tenant membership, Security Rules and trusted server functions.
