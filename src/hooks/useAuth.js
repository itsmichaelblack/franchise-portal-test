// src/hooks/useAuth.js
// Drop-in auth hook. Handles Google sign-in, TOTP MFA enforcement,
// and fetches the user's role + locationId from Firestore.

import { useState, useEffect } from "react";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "../firebase";

export function useAuth() {
  const [user, setUser]       = useState(null);   // Firebase Auth user
  const [profile, setProfile] = useState(null);   // Firestore user document
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ── Fetch Firestore profile ────────────────────────────────────────────────
  async function fetchProfile(firebaseUser) {
    const snap = await getDoc(doc(db, "users", firebaseUser.uid));
    if (snap.exists()) {
      setProfile(snap.data());
    } else {
      // New user — profile will be created by an admin or Cloud Function
      setProfile(null);
    }
  }

  // ── Auth state listener ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await fetchProfile(firebaseUser);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  // Returns { requiresMfa: true, resolver } if the account has TOTP enrolled.
  async function signInWithGoogle() {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await fetchProfile(result.user);
      return { success: true };
    } catch (err) {
      if (err.code === "auth/multi-factor-auth-required") {
        // User has TOTP enrolled — return resolver for second factor step
        const resolver = getMultiFactorResolver(auth, err);
        return { requiresMfa: true, resolver };
      }
      setError(err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Verify TOTP code ───────────────────────────────────────────────────────
  // Call this after signInWithGoogle returns { requiresMfa: true, resolver }
  async function verifyTotp(resolver, totpCode) {
    setError(null);
    try {
      const multiFactorAssertion =
        TotpMultiFactorGenerator.assertionForSignIn(
          resolver.hints[0].uid,
          totpCode
        );
      const result = await resolver.resolveSignIn(multiFactorAssertion);
      await fetchProfile(result.user);
      return { success: true };
    } catch (err) {
      setError("Invalid code. Please try again.");
      return { success: false, error: err.message };
    }
  }

  // ── Enrol TOTP (first time setup) ─────────────────────────────────────────
  // Returns { qrCodeUrl, secret } to show to the user.
  async function enrolTotp() {
    const session = await multiFactor(auth.currentUser).getSession();
    const totpSecret = await TotpMultiFactorGenerator.generateSecret(session);
    const qrCodeUrl = totpSecret.generateQrCodeUrl(
      auth.currentUser.email,
      "Franchise Portal"
    );
    return { qrCodeUrl, secret: totpSecret.secretKey, totpSecret };
  }

  // ── Finalise TOTP enrolment ────────────────────────────────────────────────
  async function finaliseTotp(totpSecret, verificationCode, displayName = "Authenticator App") {
    const multiFactorAssertion =
      TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, verificationCode);
    await multiFactor(auth.currentUser).enroll(multiFactorAssertion, displayName);
    return { success: true };
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  async function logout() {
    await signOut(auth);
  }

  return {
    user,
    profile,
    loading,
    error,
    signInWithGoogle,
    verifyTotp,
    enrolTotp,
    finaliseTotp,
    logout,
    isAuthenticated: !!user && !!profile,
    isMasterAdmin: profile?.role === "master_admin",
    isAdmin: profile?.role === "admin" || profile?.role === "master_admin",
    isFranchisePartner: profile?.role === "franchise_partner",
  };
}
