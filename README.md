# Yagoya v6.6.0 — Premium Graphite

This release moves the Yagoya application from a bright white canvas to a premium graphite interface while preserving the established orange Yagoya identity.

## Visual direction
- graphite application canvas rather than white
- elevated charcoal cards and work surfaces
- off-white typography and restrained muted copy
- orange reserved for brand identity, emphasis and primary actions
- darker glass-like sticky navigation and location surfaces
- dark dialogs, forms, tables and account settings for visual continuity
- QR artwork intentionally retains a white field for scanner contrast

## Product continuity
The v6.5 Firebase Email/Password authentication and compact progressive-disclosure customer Account tab remain intact, together with the v6.3 recommendation/location foundation and existing merchant, delivery, admin and governance workflows.

## Firebase Console prerequisite
Enable **Authentication → Sign-in method → Email/Password**. The Firebase web configuration in the browser is project identification, not a service-account secret. Never place Admin SDK/service-account private keys in this build.

## Authentication boundary
Customer self-registration creates authentication identity only. Merchant memberships and Yagoya Admin/Owner authority remain separately assigned and must be enforced by Firestore Security Rules, custom claims and Cloud Functions in production. The header actor selector remains a prototype preview control, not an authorization mechanism.
