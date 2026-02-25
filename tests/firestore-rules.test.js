// tests/firestore-rules.test.js
// Tests for Firestore security rules using @firebase/rules-unit-testing.
// Requires the Firestore emulator running on localhost:8080.
// Start with: firebase emulators:start --only firestore

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'test-project';
const RULES_PATH = resolve(__dirname, '../firestore.rules');

let testEnv;

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function seedUser(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), data);
  });
}

async function seedDoc(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const parts = path.split('/');
    const ref = doc(ctx.firestore(), parts[0], parts[1]);
    await setDoc(ref, data);
  });
}

function authedFs(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function unauthedFs() {
  return testEnv.unauthenticatedContext().firestore();
}

// ── users collection ──────────────────────────────────────────────────────────
describe('users collection', () => {
  const masterUid = 'master-001';
  const adminUid = 'admin-001';
  const partnerUid = 'partner-001';
  const otherUid = 'other-001';

  beforeEach(async () => {
    await seedUser(masterUid, { role: 'master_admin', name: 'Master', email: 'm@test.com' });
    await seedUser(adminUid, { role: 'admin', name: 'Admin', email: 'a@test.com' });
    await seedUser(partnerUid, { role: 'franchise_partner', name: 'Partner', email: 'p@test.com', locationId: 'loc1' });
    await seedUser(otherUid, { role: 'admin', name: 'Other', email: 'o@test.com' });
  });

  it('allows an authenticated user to read their own document', async () => {
    await assertSucceeds(getDoc(doc(authedFs(adminUid), 'users', adminUid)));
  });

  it('allows master_admin to read any user document', async () => {
    await assertSucceeds(getDoc(doc(authedFs(masterUid), 'users', partnerUid)));
  });

  it('denies a non-master_admin reading another user document', async () => {
    await assertFails(getDoc(doc(authedFs(adminUid), 'users', otherUid)));
  });

  it('denies unauthenticated read', async () => {
    await assertFails(getDoc(doc(unauthedFs(), 'users', adminUid)));
  });

  it('allows master_admin to update a user document', async () => {
    await assertSucceeds(
      updateDoc(doc(authedFs(masterUid), 'users', adminUid), { name: 'Updated Name' })
    );
  });

  it('denies non-master_admin updating any user document', async () => {
    await assertFails(
      updateDoc(doc(authedFs(adminUid), 'users', partnerUid), { role: 'master_admin' })
    );
  });

  it('denies deletion of user documents by anyone', async () => {
    await assertFails(deleteDoc(doc(authedFs(masterUid), 'users', adminUid)));
  });
});

// ── locations collection ──────────────────────────────────────────────────────
describe('locations collection', () => {
  const masterUid = 'master-002';
  const adminUid = 'admin-002';
  const partnerUid = 'partner-002';

  beforeEach(async () => {
    await seedUser(masterUid, { role: 'master_admin', name: 'Master', email: 'm@test.com' });
    await seedUser(adminUid, { role: 'admin', name: 'Admin', email: 'a@test.com' });
    await seedUser(partnerUid, { role: 'franchise_partner', name: 'Partner', email: 'p@test.com', locationId: 'loc-001' });
    await seedDoc('locations/loc-001', { name: 'Test Centre', address: '1 St', phone: '0400', email: 'c@test.com', createdAt: 'now' });
    await seedDoc('locations/loc-other', { name: 'Other Centre', address: '2 St', phone: '0400', email: 'd@test.com', createdAt: 'now' });
  });

  it('allows admin to read any location', async () => {
    await assertSucceeds(getDoc(doc(authedFs(adminUid), 'locations', 'loc-001')));
  });

  it('allows franchise_partner to read their own location', async () => {
    await assertSucceeds(getDoc(doc(authedFs(partnerUid), 'locations', 'loc-001')));
  });

  it('denies franchise_partner reading a different location', async () => {
    await assertFails(getDoc(doc(authedFs(partnerUid), 'locations', 'loc-other')));
  });

  it('denies unauthenticated read', async () => {
    await assertFails(getDoc(doc(unauthedFs(), 'locations', 'loc-001')));
  });

  it('allows admin to create a valid location', async () => {
    await assertSucceeds(
      setDoc(doc(authedFs(adminUid), 'locations', 'new-loc'), {
        name: 'New Centre', address: '3 St', phone: '0400', email: 'new@test.com', createdAt: 'now',
      })
    );
  });

  it('denies franchise_partner creating a location', async () => {
    await assertFails(
      setDoc(doc(authedFs(partnerUid), 'locations', 'new-loc'), {
        name: 'New', address: '3 St', phone: '0400', email: 'new@test.com', createdAt: 'now',
      })
    );
  });

  it('allows master_admin to delete a location', async () => {
    await assertSucceeds(deleteDoc(doc(authedFs(masterUid), 'locations', 'loc-001')));
  });

  it('denies non-master_admin deleting a location', async () => {
    await assertFails(deleteDoc(doc(authedFs(adminUid), 'locations', 'loc-001')));
  });
});

// ── services collection ───────────────────────────────────────────────────────
describe('services collection', () => {
  const adminUid = 'admin-003';
  const partnerUid = 'partner-003';

  beforeEach(async () => {
    await seedUser(adminUid, { role: 'admin', name: 'Admin', email: 'a@test.com' });
    await seedUser(partnerUid, { role: 'franchise_partner', name: 'Partner', email: 'p@test.com', locationId: 'loc1' });
    await seedDoc('services/svc-001', { name: 'HSC Preparation', description: 'Test', duration: 60 });
  });

  it('allows public (unauthenticated) read of services', async () => {
    await assertSucceeds(getDoc(doc(unauthedFs(), 'services', 'svc-001')));
  });

  it('allows admin to write a service', async () => {
    await assertSucceeds(
      setDoc(doc(authedFs(adminUid), 'services', 'new-svc'), {
        name: 'New Service', description: 'A test service', duration: 40,
      })
    );
  });

  it('denies franchise_partner writing a service', async () => {
    await assertFails(
      setDoc(doc(authedFs(partnerUid), 'services', 'new-svc'), {
        name: 'Rogue Service', description: 'Should fail', duration: 40,
      })
    );
  });

  it('denies unauthenticated write', async () => {
    await assertFails(
      setDoc(doc(unauthedFs(), 'services', 'new-svc'), { name: 'Bad', description: 'Bad', duration: 40 })
    );
  });
});

// ── activity_logs collection ──────────────────────────────────────────────────
describe('activity_logs collection', () => {
  const adminUid = 'admin-004';
  const partnerUid = 'partner-004';
  const attackerUid = 'attacker-004';

  beforeEach(async () => {
    await seedUser(adminUid, { role: 'admin', name: 'Admin', email: 'a@test.com' });
    await seedUser(partnerUid, { role: 'franchise_partner', name: 'Partner', email: 'p@test.com', locationId: 'loc1' });
    await seedUser(attackerUid, { role: 'franchise_partner', name: 'Attacker', email: 'bad@test.com', locationId: 'loc2' });
    await seedDoc('activity_logs/log-001', {
      userId: partnerUid, locationId: 'loc1', action: 'sign_in', category: 'auth',
    });
  });

  it('allows an authenticated user to create a log with their own userId', async () => {
    await assertSucceeds(
      addDoc(collection(authedFs(partnerUid), 'activity_logs'), {
        userId: partnerUid,
        locationId: 'loc1',
        action: 'sign_in',
        category: 'auth',
        details: 'Signed in',
      })
    );
  });

  it('denies creating a log with a different userId (audit log forgery)', async () => {
    await assertFails(
      addDoc(collection(authedFs(attackerUid), 'activity_logs'), {
        userId: adminUid,
        locationId: 'loc1',
        action: 'delete_location',
        category: 'admin',
        details: 'This log is forged',
      })
    );
  });

  it('allows admin to read activity logs', async () => {
    await assertSucceeds(getDoc(doc(authedFs(adminUid), 'activity_logs', 'log-001')));
  });

  it('allows franchise_partner to read logs for their own location', async () => {
    await assertSucceeds(getDoc(doc(authedFs(partnerUid), 'activity_logs', 'log-001')));
  });

  it('denies updating any activity log', async () => {
    await assertFails(
      updateDoc(doc(authedFs(adminUid), 'activity_logs', 'log-001'), { action: 'tampered' })
    );
  });

  it('denies deleting any activity log', async () => {
    await assertFails(deleteDoc(doc(authedFs(adminUid), 'activity_logs', 'log-001')));
  });
});

// ── invites collection ────────────────────────────────────────────────────────
describe('invites collection', () => {
  const masterUid = 'master-005';
  const adminUid = 'admin-005';
  const partnerUid = 'partner-005';

  beforeEach(async () => {
    await seedUser(masterUid, { role: 'master_admin', name: 'Master', email: 'm@test.com' });
    await seedUser(adminUid, { role: 'admin', name: 'Admin', email: 'a@test.com' });
    await seedUser(partnerUid, { role: 'franchise_partner', name: 'Partner', email: 'p@test.com', locationId: 'loc1' });
    await seedDoc('invites/inv-001', { email: 'invite@test.com', role: 'admin', used: false });
  });

  it('allows master_admin to create an invite', async () => {
    await assertSucceeds(
      setDoc(doc(authedFs(masterUid), 'invites', 'inv-new'), {
        email: 'new@test.com', role: 'admin', used: false,
      })
    );
  });

  it('denies admin (non-master) creating an invite', async () => {
    await assertFails(
      setDoc(doc(authedFs(adminUid), 'invites', 'inv-new'), {
        email: 'new@test.com', role: 'admin', used: false,
      })
    );
  });

  it('denies unauthenticated creating an invite', async () => {
    await assertFails(
      setDoc(doc(unauthedFs(), 'invites', 'inv-new'), {
        email: 'hack@test.com', role: 'master_admin', used: false,
      })
    );
  });

  it('allows any authenticated user to read an invite (for invite token consumption)', async () => {
    await assertSucceeds(getDoc(doc(authedFs(partnerUid), 'invites', 'inv-001')));
  });
});
