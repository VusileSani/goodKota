# GoodKota v23.4 cloud pilot deployment

This package does not change Google Cloud resources by itself. Deploy it through Firebase Hosting + Cloud Run, then perform the live-only acceptance checks in `RELEASE_STATUS_v23.4.md`.

## 1. Region, billing and runtime identity

Cloud Run requires billing on project `goodkota`. Set a budget/alert before enabling paid services. The Hosting rewrite is configured for `europe-west1`; keep Firestore and Cloud Run colocated there for the current pilot unless you deliberately choose a different supported architecture.

Use a dedicated runtime service account such as `goodkota-api@goodkota.iam.gserviceaccount.com`. Grant only the Firestore and Firebase/Identity Platform permissions required by this API. Do not generate or commit a service-account JSON key.

## 2. Firebase prerequisites

1. Keep Email/Password enabled in Firebase Authentication.
2. Confirm `goodkota.web.app` and `goodkota.firebaseapp.com` are authorized domains.
3. Use the default Firestore database in Native mode and deploy the supplied `firestore.rules`; browser reads/writes remain denied.
4. Configure `GOODKOTA_ADMIN_UID` with a dedicated verified administrator account. Admin access additionally requires TOTP in Firebase mode.
5. Do **not** configure a general customer UID allowlist. v23.4 intentionally permits ordinary Firebase customers to create GoodKota customer sessions. Merchant privileges are granted only through the invitation/claim role flow.

## 3. Transactional Ready email

In-app Ready notifications work without an external mail provider. To reach customers when the app/browser is closed, configure transactional email on Cloud Run:

- `GOODKOTA_MAIL_FROM` — a sender address/domain accepted by your mail provider.
- `RESEND_API_KEY` — store this as a Cloud secret, not in the repository or a screenshot/chat message.

After deployment, `/api/auth/capabilities` must report `orderReadyEmailAvailable: true` before GoodKota should be described as having external Ready-email delivery. If it is false, Admin → Overview deliberately shows **In-app only**.

## 4. Build and deploy the API

From the extracted v23.4 folder on a deployment machine/CI with Node, `gcloud` and Firebase CLI installed:

```sh
npm ci
npm run build
npm test
gcloud config set project goodkota
gcloud run deploy goodkota-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --service-account goodkota-api@goodkota.iam.gserviceaccount.com \
  --max-instances 2 \
  --set-env-vars GOODKOTA_STORAGE=firestore,GOODKOTA_FIREBASE_PROJECT_ID=goodkota,GOODKOTA_PUBLIC_ORIGIN=https://goodkota.web.app,GOODKOTA_MAIL_FROM=YOUR_VERIFIED_SENDER
```

Attach `RESEND_API_KEY` through Google Cloud Secret Manager/Cloud Run secret configuration rather than writing the secret into the command or repository.

The Cloud Run service is publicly reachable so Firebase Hosting can rewrite `/api/**` to it; sensitive operations remain protected by the Firebase session, role checks and server-side authorization.

## 5. Deploy Hosting and Firestore rules

`npm run build` prepares the `public/` folder from an explicit allowlist. Then:

```sh
firebase login
firebase use goodkota
firebase deploy --only firestore:rules,hosting
```

Open `https://goodkota.web.app/`. Confirm:

- `/api/health` returns `{"status":"ok"}`.
- `/api/auth/capabilities` returns `provider: "firebase"`.
- The site still shows **Private pilot · Test orders only**.
- Browser Firestore access remains denied; operational data flows only through `/api/**`.

## 6. Live v23.4 acceptance test

Use separate real accounts for customer, merchant and admin.

1. Register a brand-new customer that has never appeared in GoodKota. Verify the email.
2. Confirm Admin → Customers shows the account, verification state and retained profile fields.
3. Save name/mobile, sign out and sign back in. Confirm Account retains them and checkout does not ask for them again.
4. Submit/approve a merchant application or use an existing approved merchant. Invite a separate merchant operator and claim it with the invited email.
5. Place an order as the customer. Confirm the merchant sees it, accepts it and can mark it Ready.
6. Confirm the customer receives the retained in-app Ready alert. If `orderReadyEmailAvailable` is true, confirm the Ready email arrives as well.
7. Confirm the merchant cannot operate a different store and a customer cannot use merchant/admin actions.
8. Confirm admin sign-in requires the configured UID and TOTP.

## 7. Admin MFA

If TOTP is not already enabled for the Firebase/Identity Platform project, review the project-level change and pricing first. The supplied `scripts/enable-totp.mjs` performs that configuration only when `GOODKOTA_CONFIRM_TOTP_CONFIG=1` is explicitly set and privileged Application Default Credentials are available. Do not transmit TOTP setup keys or recovery codes in chat.

## Rollback and current boundaries

Firebase Hosting and Cloud Run both support revision rollback; Firestore data survives those rollbacks. v23.4 uses partitioned documents for orders, merchants, profiles, applications, support cases and audit events. The compatibility repository is still a pilot-oriented transaction boundary and should be replaced with targeted hot-path transactions before high traffic.

Online PayFast checkout remains disabled. Do not advertise split settlement, provider-verified refunds or live online payments until that separate integration is complete and tested.
