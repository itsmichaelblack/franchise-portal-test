// src/firebase.js
// Firebase SDK initialisation — import from this file throughout the app.

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

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

// ── Storage ────────────────────────────────────────────────────────────────────
export const storage = getStorage(app);

export default app;
