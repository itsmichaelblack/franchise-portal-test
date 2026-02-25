// src/firebase.js
// Firebase SDK initialisation — import from this file throughout the app.

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithCustomToken } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey:            "AIzaSyDG1LOpFz05Ty9_J7IO6XQvKUJnLTXoriE",
  authDomain:        "success-tutoring-test.firebaseapp.com",
  projectId:         "success-tutoring-test",
  storageBucket:     "success-tutoring-test.firebasestorage.app",
  messagingSenderId: "58527178263",
  appId:             "1:58527178263:web:faa2bb480a5e7f930ec652",
  measurementId:     "G-7S5N5Y4824",
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
