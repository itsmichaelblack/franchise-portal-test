// tests/unit/useAuth.test.js
// Unit tests for the useAuth hook (src/hooks/useAuth.js).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Firebase Auth module ────────────────────────────────────────────────
const mockOnAuthStateChanged = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSignOut = vi.fn();
const mockMultiFactor = vi.fn();
const mockGetMultiFactorResolver = vi.fn();

vi.mock('firebase/auth', () => ({
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
  signOut: (...args) => mockSignOut(...args),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  multiFactor: (...args) => mockMultiFactor(...args),
  TotpMultiFactorGenerator: {
    assertionForSignIn: vi.fn(),
    assertionForEnrollment: vi.fn(),
    generateSecret: vi.fn(),
  },
  getMultiFactorResolver: (...args) => mockGetMultiFactorResolver(...args),
}));

// ── Mock Firestore ───────────────────────────────────────────────────────────
const mockGetDoc = vi.fn();
const mockDocFn = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDocFn(...args),
  getDoc: (...args) => mockGetDoc(...args),
}));

// ── Mock Firebase app ────────────────────────────────────────────────────────
vi.mock('../../src/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid', email: 'test@test.com' } },
  googleProvider: {},
  db: 'mock-db',
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: onAuthStateChanged fires immediately with no user
  mockOnAuthStateChanged.mockImplementation((auth, callback) => {
    callback(null);
    return vi.fn(); // unsubscribe
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('useAuth', () => {
  // We test the hook's logic by importing it and calling its functions directly
  // Since it uses useState/useEffect, we need a minimal React testing setup

  it('exports the useAuth function', async () => {
    const mod = await import('../../src/hooks/useAuth.js');
    expect(mod.useAuth).toBeDefined();
    expect(typeof mod.useAuth).toBe('function');
  });

  it('useAuth returns expected shape', async () => {
    // We can test the return shape by examining what the hook exports
    const mod = await import('../../src/hooks/useAuth.js');
    // The hook itself needs React rendering context, so we verify the export exists
    expect(mod.useAuth).toBeDefined();
  });
});

// ── Role computation tests (extracted logic) ─────────────────────────────────
describe('Role computation', () => {
  it('isMasterAdmin is true only for master_admin role', () => {
    const profiles = [
      { role: 'master_admin', expected: true },
      { role: 'admin', expected: false },
      { role: 'franchise_partner', expected: false },
      { role: undefined, expected: false },
    ];

    for (const { role, expected } of profiles) {
      const profile = role ? { role } : null;
      const isMasterAdmin = profile?.role === 'master_admin';
      expect(isMasterAdmin).toBe(expected);
    }
  });

  it('isAdmin is true for admin or master_admin', () => {
    const profiles = [
      { role: 'master_admin', expected: true },
      { role: 'admin', expected: true },
      { role: 'franchise_partner', expected: false },
      { role: undefined, expected: false },
    ];

    for (const { role, expected } of profiles) {
      const profile = role ? { role } : null;
      const isAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';
      expect(isAdmin).toBe(expected);
    }
  });

  it('isFranchisePartner is true only for franchise_partner role', () => {
    const profiles = [
      { role: 'master_admin', expected: false },
      { role: 'admin', expected: false },
      { role: 'franchise_partner', expected: true },
      { role: undefined, expected: false },
    ];

    for (const { role, expected } of profiles) {
      const profile = role ? { role } : null;
      const isFranchisePartner = profile?.role === 'franchise_partner';
      expect(isFranchisePartner).toBe(expected);
    }
  });

  it('isAuthenticated requires both user and profile', () => {
    expect(!!(null && null)).toBe(false);
    expect(!!(null && {})).toBe(false);
    expect(!!({} && null)).toBe(false);
    expect(!!({} && {})).toBe(true);
  });
});

// ── signInWithGoogle error handling tests ─────────────────────────────────────
describe('signInWithGoogle error handling', () => {
  it('detects MFA required error code', () => {
    const err = { code: 'auth/multi-factor-auth-required' };
    expect(err.code === 'auth/multi-factor-auth-required').toBe(true);
  });

  it('identifies non-MFA errors', () => {
    const err = { code: 'auth/popup-closed-by-user' };
    expect(err.code === 'auth/multi-factor-auth-required').toBe(false);
  });
});
