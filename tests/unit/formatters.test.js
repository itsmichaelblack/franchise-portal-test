// tests/unit/formatters.test.js
// Unit tests for formatting utility functions.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDateValue,
  formatUTCDate,
  formatRelativeTime,
  fmtTime,
  getActionBadgeClass,
  getActionLabel,
  buildSummary,
} from '../../src/utils/formatters.js';

// ── formatDateValue ──────────────────────────────────────────────────────────
describe('formatDateValue', () => {
  it('returns null for null/undefined input', () => {
    expect(formatDateValue(null)).toBeNull();
    expect(formatDateValue(undefined)).toBeNull();
    expect(formatDateValue('')).toBeNull();
    expect(formatDateValue(0)).toBeNull();
  });

  it('returns the string as-is for string input', () => {
    expect(formatDateValue('25 Feb 2026')).toBe('25 Feb 2026');
    expect(formatDateValue('some date')).toBe('some date');
  });

  it('formats a Firestore timestamp object (with .toDate())', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2026-03-15T00:00:00'),
    };
    const result = formatDateValue(fakeTimestamp);
    expect(result).toContain('2026');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  it('formats a plain Date object', () => {
    const date = new Date('2026-01-01T00:00:00');
    const result = formatDateValue(date);
    expect(result).toContain('2026');
    expect(result).toContain('Jan');
  });

  it('formats an object with .seconds property', () => {
    const ts = { seconds: 1772524800 }; // roughly 2026-03-01
    const result = formatDateValue(ts);
    expect(result).toContain('2026');
  });

  it('converts other values to string', () => {
    expect(formatDateValue(42)).toBe('42');
    expect(formatDateValue(true)).toBe('true');
  });
});

// ── formatUTCDate ────────────────────────────────────────────────────────────
describe('formatUTCDate', () => {
  it('returns "—" for null/undefined', () => {
    expect(formatUTCDate(null)).toBe('—');
    expect(formatUTCDate(undefined)).toBe('—');
  });

  it('formats a Date into UTC datetime string', () => {
    const date = new Date('2026-06-15T14:30:00Z');
    const result = formatUTCDate(date);
    expect(result).toBe('2026-06-15 14:30:00 UTC');
  });

  it('handles midnight correctly', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const result = formatUTCDate(date);
    expect(result).toBe('2026-01-01 00:00:00 UTC');
  });

  it('handles end of year', () => {
    const date = new Date('2026-12-31T23:59:59Z');
    const result = formatUTCDate(date);
    expect(result).toBe('2026-12-31 23:59:59 UTC');
  });
});

// ── formatRelativeTime ───────────────────────────────────────────────────────
describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null/undefined', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('returns "Just now" for < 1 minute ago', () => {
    const date = new Date('2026-02-25T11:59:30Z'); // 30 seconds ago
    expect(formatRelativeTime(date)).toBe('Just now');
  });

  it('returns minutes ago', () => {
    const date = new Date('2026-02-25T11:55:00Z'); // 5 minutes ago
    expect(formatRelativeTime(date)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const date = new Date('2026-02-25T09:00:00Z'); // 3 hours ago
    expect(formatRelativeTime(date)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const date = new Date('2026-02-22T12:00:00Z'); // 3 days ago
    expect(formatRelativeTime(date)).toBe('3d ago');
  });

  it('returns months ago', () => {
    const date = new Date('2025-11-25T12:00:00Z'); // ~3 months ago
    expect(formatRelativeTime(date)).toBe('3mo ago');
  });
});

// ── fmtTime ──────────────────────────────────────────────────────────────────
describe('fmtTime', () => {
  it('converts midnight (00:00) to 12:00 AM', () => {
    expect(fmtTime('00:00')).toBe('12:00 AM');
  });

  it('converts noon (12:00) to 12:00 PM', () => {
    expect(fmtTime('12:00')).toBe('12:00 PM');
  });

  it('converts morning time (09:30) to 9:30 AM', () => {
    expect(fmtTime('09:30')).toBe('9:30 AM');
  });

  it('converts afternoon time (14:45) to 2:45 PM', () => {
    expect(fmtTime('14:45')).toBe('2:45 PM');
  });

  it('converts 23:59 to 11:59 PM', () => {
    expect(fmtTime('23:59')).toBe('11:59 PM');
  });

  it('handles single-digit minutes with padding', () => {
    expect(fmtTime('15:05')).toBe('3:05 PM');
  });
});

// ── getActionBadgeClass ──────────────────────────────────────────────────────
describe('getActionBadgeClass', () => {
  it('maps known actions to their class names', () => {
    expect(getActionBadgeClass('sign_in')).toBe('sign_in');
    expect(getActionBadgeClass('sign_out')).toBe('sign_out');
    expect(getActionBadgeClass('edit')).toBe('edit');
    expect(getActionBadgeClass('create')).toBe('create');
    expect(getActionBadgeClass('delete')).toBe('delete');
    expect(getActionBadgeClass('update')).toBe('update');
    expect(getActionBadgeClass('view')).toBe('view');
  });

  it('returns "default" for unknown actions', () => {
    expect(getActionBadgeClass('unknown')).toBe('default');
    expect(getActionBadgeClass('')).toBe('default');
    expect(getActionBadgeClass('foo')).toBe('default');
  });
});

// ── getActionLabel ───────────────────────────────────────────────────────────
describe('getActionLabel', () => {
  it('maps known actions to display labels', () => {
    expect(getActionLabel('sign_in')).toBe('Sign In');
    expect(getActionLabel('sign_out')).toBe('Sign Out');
    expect(getActionLabel('edit')).toBe('Edit');
    expect(getActionLabel('create')).toBe('Create');
    expect(getActionLabel('delete')).toBe('Delete');
    expect(getActionLabel('update')).toBe('Update');
    expect(getActionLabel('view')).toBe('View');
    expect(getActionLabel('resend_email')).toBe('Resend Email');
  });

  it('returns the action string itself for unknown actions', () => {
    expect(getActionLabel('custom_action')).toBe('custom_action');
    expect(getActionLabel('foo')).toBe('foo');
  });
});

// ── buildSummary ─────────────────────────────────────────────────────────────
describe('buildSummary', () => {
  it('returns "No actions" for empty counts', () => {
    expect(buildSummary({})).toBe('No actions');
  });

  it('summarizes sign_in counts with correct plural', () => {
    expect(buildSummary({ sign_in: 1 })).toBe('1 sign-in');
    expect(buildSummary({ sign_in: 3 })).toBe('3 sign-ins');
  });

  it('summarizes multiple action types', () => {
    const result = buildSummary({ sign_in: 2, edit: 1, create: 3 });
    expect(result).toBe('2 sign-ins, 1 edit, 3 creates');
  });

  it('groups non-standard actions as "other"', () => {
    const result = buildSummary({ sign_in: 1, view: 2, update: 3 });
    expect(result).toBe('1 sign-in, 5 other');
  });

  it('handles delete with correct pluralization', () => {
    expect(buildSummary({ delete: 1 })).toBe('1 deletion');
    expect(buildSummary({ delete: 4 })).toBe('4 deletions');
  });
});
