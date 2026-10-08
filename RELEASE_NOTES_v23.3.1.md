# GoodKota v23.3.1 public registration pilot

This revision corrects the release gate for the public-registration pilot. The server and customer/merchant UI are the v23.3 pilot; the changes here are in tests, version metadata, and these release notes.

- The cloud HTTP test now verifies a customer can exchange a Firebase token when the UID allowlist is absent. The existing restricted-pilot test still checks that an explicit allowlist excludes unknown users.
- Four tests check Unix file modes only on Unix; Windows does not expose the same POSIX mode bits.
- The PayFast setup test now looks for the Firebase Hosting-compatible `__session` cookie.
- All 18 test suites and `npm run build` passed in the maintainer's Linux test environment with the pinned dependency versions. A fresh `npm ci` could not complete there because the package registry was blocked; run `npm ci`, `npm run build`, and `npm test` on a connected deployment workstation.

## Existing live service

Copy the complete `gkwork` contents into the repository root. Commit and push after the clean-install gate passes. A Git push alone does not deploy the Cloud Run API or Firebase Hosting unless you have explicitly configured an automated deployment workflow.

Deploy the API and Hosting using the existing project procedure in `docs/CLOUD-PILOT.md`. Once the new API revision is serving, remove only the old invited-UID restriction:

```bash
gcloud run services update goodkota-api --project goodkota --region europe-west1 --remove-env-vars GOODKOTA_PILOT_UIDS
```

Keep `GOODKOTA_ADMIN_UID` set. Admin access continues to require verified email and TOTP. An empty or absent `GOODKOTA_PILOT_UIDS` is what permits new verified customers to enter. Verify a new customer account, a merchant application, and admin approval on `https://goodkota.web.app/` before sharing the pilot widely.

No live PayFast checkout or fund splitting is enabled by this release. Test orders should not imply a collected payment.
