# GoodKota v23.4 — release status

**Local engineering status: COMPLETE for the agreed v23.4 scope.**

The source, server workflows and deployable Hosting assets have been consolidated around the following acceptance criteria:

- Admin customer directory with correct customer/merchant/admin role separation.
- Operational audit of customer, merchant and administrator workflows.
- Retained customer profile captured once and reused at checkout/future logins.
- Clear sign-in / create-account / merchant-invitation action hierarchy.
- Removed arbitrary discovery filter strip.
- Persistent order-Ready in-app alerts plus optional transactional email delivery.
- Notification configuration visibility for administrators and delivery warnings for merchants.
- Open real-customer Firebase registration without a stale pilot UID allowlist.
- Firebase Hosting-compatible `__session` cookie.
- Full repository regression suite passing.

## What still requires live verification
These items cannot be truthfully proven from the local package because they depend on the deployed Firebase/Google Cloud configuration:

1. Deploy Cloud Run and Firebase Hosting, then confirm `/api/health` and `/api/auth/capabilities` on `goodkota.web.app`.
2. Register a brand-new Firebase customer not previously known to GoodKota; verify email and confirm the account appears in Admin → Customers.
3. Edit the customer's profile, sign out, sign back in, and confirm name/mobile remain retained and checkout does not request them again.
4. Place a real pilot order, accept it as the correct merchant, mark it Ready, and confirm the in-app alert appears for the customer.
5. If closed-browser Ready messages are required, configure the Resend sender/API secret, confirm `orderReadyEmailAvailable: true`, and verify receipt of the Ready email. Without this live configuration, the build deliberately reports **In-app only** rather than pretending external delivery is active.
6. Confirm merchant/admin role isolation with separate real accounts and confirm admin MFA on the deployed Firebase project.
7. Run `npm ci && npm run build && npm test` in the deployment workstation/CI where package installation is available, then deploy the generated `public/` folder. The checked-in Firebase client bundle was unchanged by v23.4 and the Hosting assets in this package are synchronized from source.

Online PayFast checkout remains intentionally disabled; v23.4 does not change that product boundary.
