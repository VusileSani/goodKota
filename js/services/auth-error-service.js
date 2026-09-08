export function friendlyAuthError(error) {
  const code = String(error?.code || "");
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "That email already has a Yagoya account.";
  if (code.includes("weak-password")) return "Use a password with at least 6 characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("operation-not-allowed")) return "Email/Password sign-in is not enabled in Firebase Authentication yet.";
  return error?.message || "Authentication could not be completed.";
}
