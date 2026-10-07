import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function firebaseAdminApp(projectId = process.env.GOODKOTA_FIREBASE_PROJECT_ID || "goodkota") {
  if (!projectId) throw new Error("Set GOODKOTA_FIREBASE_PROJECT_ID.");
  return getApps().find(item => item.name === `goodkota-${projectId}`) || initializeApp({credential:applicationDefault(),projectId},`goodkota-${projectId}`);
}
export const firebaseAdminAuth = projectId => getAuth(firebaseAdminApp(projectId));
export const firebaseAdminFirestore = projectId => getFirestore(firebaseAdminApp(projectId));
