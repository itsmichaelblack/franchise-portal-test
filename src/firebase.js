// src/firebase.js
// Firebase SDK initialisation — import from this file throughout the app.

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithCustomToken } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// ── Auth ───────────────────────────────────────────────────────────────────────
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// ── Firestore ──────────────────────────────────────────────────────────────────
export const db = getFirestore(app);

// ── Functions ──────────────────────────────────────────────────────────────────
export const functions = getFunctions(app);

// ── Emulator connections (local development & E2E testing only) ────────────────
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);

  // Expose test-only auth helper for Playwright E2E tests
  window.__signInWithToken__ = (token) => signInWithCustomToken(auth, token);
}

export default app;
