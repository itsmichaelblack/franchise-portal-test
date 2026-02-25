// src/services/firestore.js
// All Firestore read/write operations. Import these into your components
// instead of calling Firestore directly — keeps logic out of the UI.

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";

// ── Locations ────────────────────────────────────────────────────────────────

/**
 * Fetch all franchise locations (HQ staff only — enforced by Firestore rules).
 * Returns an array of { id, ...data } objects sorted by createdAt descending.
 */
export async function getLocations() {
  const q = query(collection(db, "locations"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Create a new franchise location.
 * Triggers the `onLocationCreated` Cloud Function which sends the
 * SendGrid confirmation email.
 *
 * @param {{ name, address, phone, email }} data
 * @returns {Promise<string>} The new document ID
 */
export async function createLocation(data) {
  const ref = await addDoc(collection(db, "locations"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update an existing location (admin or master_admin).
 */
export async function updateLocation(locationId, data) {
  await updateDoc(doc(db, "locations", locationId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a location (master_admin only — enforced by Firestore rules).
 */
export async function deleteLocation(locationId) {
  await deleteDoc(doc(db, "locations", locationId));
}

// ── Availability ─────────────────────────────────────────────────────────────

/**
 * Fetch availability for a specific location.
 * Returns null if no availability has been set yet.
 *
 * @param {string} locationId
 */
export async function getAvailability(locationId) {
  const snap = await getDoc(doc(db, "availability", locationId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Save (create or overwrite) availability for a location.
 * Only the franchise partner assigned to this locationId can call this
 * (enforced by Firestore rules).
 *
 * @param {string} locationId
 * @param {{ schedule: Array, timezone: string, bufferMinutes: number }} data
 */
export async function saveAvailability(locationId, data) {
  await setDoc(doc(db, "availability", locationId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a user's Firestore profile by UID.
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/**
 * Create or update a user's profile (master_admin only via Firestore rules).
 * Used when HQ creates a new franchise partner account.
 *
 * @param {string} uid  Firebase Auth UID
 * @param {{ role, name, locationId? }} profile
 */
export async function setUserProfile(uid, profile) {
  await setDoc(doc(db, "users", uid), {
    ...profile,
    updatedAt: serverTimestamp(),
  });
}

// ── Cloud Function: manually trigger confirmation email ───────────────────────
// Useful if the automatic trigger fails or you want to resend.

/**
 * Call the `resendConfirmationEmail` Cloud Function manually.
 * @param {string} locationId
 */
export async function resendConfirmationEmail(locationId) {
  const fn = httpsCallable(functions, "resendConfirmationEmail");
  return fn({ locationId });
}

/**
 * Call the `resendInviteEmail` Cloud Function to resend an HQ user invite.
 * @param {string} inviteId
 */
export async function resendInviteEmail(inviteId) {
  const fn = httpsCallable(functions, "resendInviteEmail");
  return fn({ inviteId });
}

// ── HQ Users ─────────────────────────────────────────────────────────────────

/**
 * Update an HQ user's profile (master_admin only via Firestore rules).
 * @param {string} userId  Firebase Auth UID
 * @param {{ name?: string, jobTitle?: string, role?: string }} data
 */
export async function updateHqUser(userId, data) {
  await updateDoc(doc(db, "users", userId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ── Activity Logs ─────────────────────────────────────────────────────────────

/**
 * Log a user action for a specific location.
 * @param {{ locationId: string, userId: string, userName: string, userEmail: string, action: string, category: string, details?: string, metadata?: object }} logEntry
 */
export async function logUserAction(logEntry) {
  try {
    await addDoc(collection(db, "activity_logs"), {
      ...logEntry,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to log action:", e);
  }
}

/**
 * Fetch activity logs for a specific location, ordered by most recent first.
 * Falls back to unordered query if composite index is not yet available.
 * @param {string} locationId
 * @returns {Promise<Array>}
 */
export async function getActivityLogs(locationId) {
  const { where } = await import("firebase/firestore");
  try {
    const q = query(
      collection(db, "activity_logs"),
      where("locationId", "==", locationId),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("getActivityLogs: indexed query failed, trying fallback:", e.message);
    // Fallback: query without orderBy (no composite index needed), sort client-side
    try {
      const q = query(
        collection(db, "activity_logs"),
        where("locationId", "==", locationId)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return results.sort((a, b) => {
        const tsA = a.timestamp?.seconds || 0;
        const tsB = b.timestamp?.seconds || 0;
        return tsB - tsA;
      });
    } catch (fallbackErr) {
      console.error("getActivityLogs: fallback query also failed:", fallbackErr);
      return [];
    }
  }
}

/**
 * Fetch all activity logs for a specific HQ user (global across all locations).
 * Falls back to unordered query if composite index is not yet available.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getHqUserLogs(userId) {
  const { where } = await import("firebase/firestore");
  try {
    const q = query(
      collection(db, "activity_logs"),
      where("userId", "==", userId),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("getHqUserLogs: indexed query failed, trying fallback:", e.message);
    // Fallback: query without orderBy (no composite index needed), sort client-side
    try {
      const q = query(
        collection(db, "activity_logs"),
        where("userId", "==", userId)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return results.sort((a, b) => {
        const tsA = a.timestamp?.seconds || 0;
        const tsB = b.timestamp?.seconds || 0;
        return tsB - tsA;
      });
    } catch (fallbackErr) {
      console.error("getHqUserLogs: fallback query also failed:", fallbackErr);
      return [];
    }
  }
}
