import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let cached;

function sdk() {
  if (cached) return cached;
  try {
    const { initializeApp, getApps, applicationDefault } = require("firebase-admin/app");
    const { getAuth } = require("firebase-admin/auth");
    const { getFirestore } = require("firebase-admin/firestore");
    cached = {initializeApp,getApps,applicationDefault,getAuth,getFirestore};
    return cached;
  } catch (error) {
    const wrapped = new Error("Firebase Admin SDK is not installed. Run npm ci before starting the Firebase-backed service.");
    wrapped.cause = error;
    throw wrapped;
  }
}

function firebaseAdminApp(projectId = process.env.GOODKOTA_FIREBASE_PROJECT_ID || "goodkota") {
  if (!projectId) throw new Error("Set GOODKOTA_FIREBASE_PROJECT_ID.");
  const {initializeApp,getApps,applicationDefault} = sdk();
  return getApps().find(item => item.name === `goodkota-${projectId}`) || initializeApp({credential:applicationDefault(),projectId},`goodkota-${projectId}`);
}

export const firebaseAdminAuth = projectId => sdk().getAuth(firebaseAdminApp(projectId));
export const firebaseAdminFirestore = projectId => sdk().getFirestore(firebaseAdminApp(projectId));
