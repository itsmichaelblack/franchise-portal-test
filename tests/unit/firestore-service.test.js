// tests/unit/firestore-service.test.js
// Unit tests for the Firestore service layer (src/services/firestore.js).
// Mocks the Firebase SDK to test the service functions in isolation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Firebase modules ────────────────────────────────────────────────────
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockServerTimestamp = vi.fn(() => 'SERVER_TIMESTAMP');
const mockQuery = vi.fn((...args) => args);
const mockOrderBy = vi.fn((...args) => args);
const mockCollection = vi.fn((...args) => args);
const mockDoc = vi.fn((...args) => args);
const mockWhere = vi.fn((...args) => args);
const mockHttpsCallable = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  getDoc: (...args) => mockGetDoc(...args),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  where: (...args) => mockWhere(...args),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

vi.mock('../../src/firebase', () => ({
  db: 'mock-db',
  functions: 'mock-functions',
}));

// ── Import the service functions after mocking ───────────────────────────────
const {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  getAvailability,
  saveAvailability,
  getUserProfile,
  setUserProfile,
  logUserAction,
  getActivityLogs,
  getHqUserLogs,
  resendConfirmationEmail,
  resendInviteEmail,
  updateHqUser,
} = await import('../../src/services/firestore.js');

// ── Setup ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── getLocations ─────────────────────────────────────────────────────────────
describe('getLocations', () => {
  it('returns an array of locations with IDs', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'loc1', data: () => ({ name: 'Sydney', address: '1 St' }) },
        { id: 'loc2', data: () => ({ name: 'Melbourne', address: '2 St' }) },
      ],
    });

    const result = await getLocations();
    expect(result).toEqual([
      { id: 'loc1', name: 'Sydney', address: '1 St' },
      { id: 'loc2', name: 'Melbourne', address: '2 St' },
    ]);
    expect(mockQuery).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('returns empty array when no locations exist', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const result = await getLocations();
    expect(result).toEqual([]);
  });
});

// ── createLocation ───────────────────────────────────────────────────────────
describe('createLocation', () => {
  it('calls addDoc with data and timestamps, returns the new ID', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-loc-123' });

    const data = { name: 'Test', address: '1 St', phone: '0400', email: 'a@b.com' };
    const result = await createLocation(data);

    expect(result).toBe('new-loc-123');
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Test',
        address: '1 St',
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      })
    );
  });
});

// ── updateLocation ───────────────────────────────────────────────────────────
describe('updateLocation', () => {
  it('calls updateDoc with the correct document path and data', async () => {
    mockUpdateDoc.mockResolvedValue();
    await updateLocation('loc1', { name: 'Updated' });

    expect(mockDoc).toHaveBeenCalledWith('mock-db', 'locations', 'loc1');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Updated', updatedAt: 'SERVER_TIMESTAMP' })
    );
  });
});

// ── deleteLocation ───────────────────────────────────────────────────────────
describe('deleteLocation', () => {
  it('calls deleteDoc with the correct document path', async () => {
    mockDeleteDoc.mockResolvedValue();
    await deleteLocation('loc1');

    expect(mockDoc).toHaveBeenCalledWith('mock-db', 'locations', 'loc1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

// ── getAvailability ──────────────────────────────────────────────────────────
describe('getAvailability', () => {
  it('returns data when availability document exists', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ schedule: [], timezone: 'Australia/Sydney', bufferMinutes: 0 }),
    });

    const result = await getAvailability('loc1');
    expect(result).toEqual({ schedule: [], timezone: 'Australia/Sydney', bufferMinutes: 0 });
  });

  it('returns null when availability document does not exist', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null });

    const result = await getAvailability('loc-missing');
    expect(result).toBeNull();
  });
});

// ── saveAvailability ─────────────────────────────────────────────────────────
describe('saveAvailability', () => {
  it('calls setDoc with the correct path and data', async () => {
    mockSetDoc.mockResolvedValue();
    const data = { schedule: [], timezone: 'Australia/Sydney', bufferMinutes: 15 };
    await saveAvailability('loc1', data);

    expect(mockDoc).toHaveBeenCalledWith('mock-db', 'availability', 'loc1');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schedule: [], timezone: 'Australia/Sydney', updatedAt: 'SERVER_TIMESTAMP' })
    );
  });
});

// ── getUserProfile ───────────────────────────────────────────────────────────
describe('getUserProfile', () => {
  it('returns profile with uid when document exists', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ name: 'Admin', role: 'master_admin', email: 'a@test.com' }),
    });

    const result = await getUserProfile('uid-1');
    expect(result).toEqual({ uid: 'uid-1', name: 'Admin', role: 'master_admin', email: 'a@test.com' });
  });

  it('returns null when user document does not exist', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null });
    const result = await getUserProfile('uid-missing');
    expect(result).toBeNull();
  });
});

// ── setUserProfile ───────────────────────────────────────────────────────────
describe('setUserProfile', () => {
  it('calls setDoc with correct path and profile data', async () => {
    mockSetDoc.mockResolvedValue();
    await setUserProfile('uid-1', { role: 'admin', name: 'Admin' });

    expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'uid-1');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 'admin', name: 'Admin', updatedAt: 'SERVER_TIMESTAMP' })
    );
  });
});

// ── logUserAction ────────────────────────────────────────────────────────────
describe('logUserAction', () => {
  it('calls addDoc with the log entry and timestamp', async () => {
    mockAddDoc.mockResolvedValue({ id: 'log1' });
    const entry = { locationId: 'loc1', userId: 'uid1', action: 'sign_in', category: 'auth' };
    await logUserAction(entry);

    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: 'loc1', userId: 'uid1', timestamp: 'SERVER_TIMESTAMP' })
    );
  });

  it('swallows errors without throwing', async () => {
    mockAddDoc.mockRejectedValue(new Error('Firestore error'));
    const entry = { locationId: 'loc1', userId: 'uid1', action: 'sign_in', category: 'auth' };
    await expect(logUserAction(entry)).resolves.toBeUndefined();
  });
});

// ── getActivityLogs ──────────────────────────────────────────────────────────
describe('getActivityLogs', () => {
  it('returns sorted logs for a location', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'log1', data: () => ({ action: 'sign_in', timestamp: { seconds: 1000 } }) },
        { id: 'log2', data: () => ({ action: 'edit', timestamp: { seconds: 2000 } }) },
      ],
    });

    const result = await getActivityLogs('loc1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBeDefined();
  });

  it('returns empty array on complete failure', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));
    const result = await getActivityLogs('loc1');
    expect(result).toEqual([]);
  });
});

// ── getHqUserLogs ────────────────────────────────────────────────────────────
describe('getHqUserLogs', () => {
  it('returns logs for a specific user', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'log1', data: () => ({ action: 'sign_in', userId: 'uid1', timestamp: { seconds: 1000 } }) },
      ],
    });

    const result = await getHqUserLogs('uid1');
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('sign_in');
  });

  it('returns empty array on complete failure', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));
    const result = await getHqUserLogs('uid1');
    expect(result).toEqual([]);
  });
});

// ── updateHqUser ─────────────────────────────────────────────────────────────
describe('updateHqUser', () => {
  it('calls updateDoc with the correct path and data', async () => {
    mockUpdateDoc.mockResolvedValue();
    await updateHqUser('uid-1', { name: 'New Name', jobTitle: 'CTO' });

    expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'uid-1');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'New Name', jobTitle: 'CTO', updatedAt: 'SERVER_TIMESTAMP' })
    );
  });
});

// ── resendConfirmationEmail ──────────────────────────────────────────────────
describe('resendConfirmationEmail', () => {
  it('calls httpsCallable with the correct function name and data', async () => {
    const mockFn = vi.fn().mockResolvedValue({ data: { success: true } });
    mockHttpsCallable.mockReturnValue(mockFn);

    await resendConfirmationEmail('loc1');

    expect(mockHttpsCallable).toHaveBeenCalledWith('mock-functions', 'resendConfirmationEmail');
    expect(mockFn).toHaveBeenCalledWith({ locationId: 'loc1' });
  });
});

// ── resendInviteEmail ────────────────────────────────────────────────────────
describe('resendInviteEmail', () => {
  it('calls httpsCallable with the correct function name and data', async () => {
    const mockFn = vi.fn().mockResolvedValue({ data: { success: true } });
    mockHttpsCallable.mockReturnValue(mockFn);

    await resendInviteEmail('inv1');

    expect(mockHttpsCallable).toHaveBeenCalledWith('mock-functions', 'resendInviteEmail');
    expect(mockFn).toHaveBeenCalledWith({ inviteId: 'inv1' });
  });
});
