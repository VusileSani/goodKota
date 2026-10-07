import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, getMultiFactorResolver, TotpMultiFactorGenerator, multiFactor } from "firebase/auth";
import { firebaseConfig } from "./firebase-config.js";

const auth = getAuth(initializeApp(firebaseConfig));
let resolver;
let secret;
const ready = setPersistence(auth,inMemoryPersistence);
const verificationSettings = () => ({url:location.origin});

export async function register(email,password) {
  await ready;
  const result = await createUserWithEmailAndPassword(auth,email,password);
  let mailPending = false;
  try { await sendEmailVerification(result.user,verificationSettings()); } catch { mailPending = true; }
  return {mailPending};
}
export async function signIn(email,password) {
  await ready;
  try { await signInWithEmailAndPassword(auth,email,password); return {signedIn:true}; }
  catch (error) {
    if (error.code !== "auth/multi-factor-auth-required") throw error;
    resolver = getMultiFactorResolver(auth,error);
    if (!resolver.hints.some(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)) throw new Error("This account has no supported authenticator method.");
    return {next:"mfa_verify"};
  }
}
export async function resolveMfa(code) {
  const hint = resolver?.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("Sign in again to continue.");
  await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid,code));
  resolver = null;
  return exchange();
}
export async function startEnrollment() {
  if (!auth.currentUser) throw new Error("Sign in again to set up your authenticator.");
  secret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(auth.currentUser).getSession());
  return {key:secret.secretKey,uri:secret.generateQrCodeUrl(auth.currentUser.email,"GoodKota")};
}
export async function finishEnrollment(code) {
  if (!auth.currentUser || !secret) throw new Error("Authenticator setup expired. Sign in again.");
  await multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret,code),"GoodKota admin");
  secret = null;
  await signOut(auth);
}
export async function exchange() {
  if (!auth.currentUser) throw new Error("Sign in again to continue.");
  const response = await fetch("./api/auth/exchange",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:await auth.currentUser.getIdToken(true)})});
  const result = await response.json();
  if (result.next) return result;
  if (!response.ok) throw new Error(result.error || "Could not start your GoodKota session.");
  await signOut(auth);
  return result;
}
export async function resetPassword(email) { await ready; await sendPasswordResetEmail(auth,email); }
export async function sendCurrentVerification() { if (!auth.currentUser) throw new Error("Sign in again."); await sendEmailVerification(auth.currentUser,verificationSettings()); }
export async function clearClient() { await signOut(auth); resolver = null; secret = null; }
