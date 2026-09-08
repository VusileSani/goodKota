import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWLDH3qSfZ0R-k5Nt2Nf0nQB8gHK5tWc8",
  authDomain: "yagoya-7dad0.firebaseapp.com",
  databaseURL: "https://yagoya-7dad0-default-rtdb.firebaseio.com",
  projectId: "yagoya-7dad0",
  storageBucket: "yagoya-7dad0.firebasestorage.app",
  messagingSenderId: "280940250327",
  appId: "1:280940250327:web:c756daf6286187dd581c92"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

export class FirebaseAuthService {
  constructor() {
    this.user = auth.currentUser;
    this.listeners = new Set();
    onAuthStateChanged(auth, user => {
      this.user = user;
      this.listeners.forEach(listener => listener(user));
    });
  }

  onChange(listener) {
    this.listeners.add(listener);
    listener(this.user);
    return () => this.listeners.delete(listener);
  }

  async signIn(email, password) {
    const credential = await signInWithEmailAndPassword(auth, String(email || '').trim(), password);
    return credential.user;
  }

  async registerCustomer(name, email, password) {
    const credential = await createUserWithEmailAndPassword(auth, String(email || '').trim(), password);
    if (String(name || '').trim()) await updateProfile(credential.user, { displayName: String(name).trim() });
    return credential.user;
  }

  async signOut() {
    await signOut(auth);
  }

  async claims() {
    if (!this.user) return {};
    return (await this.user.getIdTokenResult()).claims || {};
  }
}

export function friendlyAuthError(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'That email already has a Yagoya account.';
  if (code.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('operation-not-allowed')) return 'Email/Password sign-in is not enabled in Firebase Authentication yet.';
  return error?.message || 'Authentication could not be completed.';
}
