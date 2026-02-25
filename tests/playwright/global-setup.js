// tests/playwright/global-setup.js
// Runs once before all Playwright tests.
// Creates test users in the Firebase Auth + Firestore emulators and mints
// custom tokens that the E2E tests use to authenticate.

import admin from 'firebase-admin';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AUTH_EMULATOR_HOST = 'localhost:9099';
const FIRESTORE_EMULATOR_HOST = 'localhost:8080';
const PROJECT_ID = 'success-tutoring-test';

const MASTER_UID = 'e2e-master-admin';
const ADMIN_UID = 'e2e-admin';

export default async function globalSetup() {
  // Point Firebase Admin SDK at the local emulators
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }

  const auth = admin.auth();
  const db = admin.firestore();

  // Create or update test users in Auth emulator
  for (const [uid, email, displayName] of [
    [MASTER_UID, 'e2e-master@hq.test', 'E2E Master Admin'],
    [ADMIN_UID, 'e2e-admin@hq.test', 'E2E Admin'],
  ]) {
    try {
      await auth.updateUser(uid, { email, displayName });
    } catch {
      await auth.createUser({ uid, email, displayName });
    }
  }

  // Seed user profiles in Firestore emulator
  await db.doc(`users/${MASTER_UID}`).set({
    name: 'E2E Master Admin',
    email: 'e2e-master@hq.test',
    role: 'master_admin',
  });
  await db.doc(`users/${ADMIN_UID}`).set({
    name: 'E2E Admin',
    email: 'e2e-admin@hq.test',
    role: 'admin',
  });

  // Mint custom tokens for each test user
  const masterToken = await auth.createCustomToken(MASTER_UID);
  const adminToken = await auth.createCustomToken(ADMIN_UID);

  // Write tokens to a file so test specs can read them
  const authDir = resolve(__dirname, '.auth');
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, 'tokens.json'),
    JSON.stringify({ master: masterToken, admin: adminToken }, null, 2)
  );
}
