import { firebaseAdminAuth } from "../server/firebase-admin.mjs";

if (process.env.GOODKOTA_CONFIRM_TOTP_CONFIG !== "1") {
  throw new Error("Set GOODKOTA_CONFIRM_TOTP_CONFIG=1 only after upgrading Firebase Authentication with Identity Platform and approving TOTP for the goodkota project.");
}
await firebaseAdminAuth("goodkota").projectConfigManager().updateProjectConfig({
  multiFactorConfig:{providerConfigs:[{state:"ENABLED",totpProviderConfig:{adjacentIntervals:1}}]}
});
process.stdout.write("TOTP MFA is enabled for the goodkota Firebase project.\n");
