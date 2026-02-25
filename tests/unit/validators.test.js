// tests/unit/validators.test.js
// Unit tests for validation utility functions.

import { describe, it, expect } from 'vitest';
import { checkDuplicateLocations, validateBookingFields } from '../../src/utils/validators.js';

// ── checkDuplicateLocations ──────────────────────────────────────────────────
describe('checkDuplicateLocations', () => {
  const existingLocations = [
    { id: 'loc1', name: 'North Sydney', address: '100 Miller St, North Sydney NSW 2060', phone: '+61 411111111' },
    { id: 'loc2', name: 'Bondi Beach', address: '50 Campbell Parade, Bondi Beach NSW 2026', phone: '+61 422222222' },
    { id: 'loc3', name: 'Melbourne CBD', address: '123 Collins St, Melbourne VIC 3000', phone: '+61 433333333' },
  ];

  it('returns no warnings when no duplicates exist', () => {
    const candidate = { name: 'Chatswood', address: '1 Railway St', phone: '+61 444444444' };
    expect(checkDuplicateLocations(candidate, existingLocations)).toEqual([]);
  });

  it('detects duplicate name (exact match)', () => {
    const candidate = { name: 'North Sydney', address: '1 Other St', phone: '+61 499999999' };
    const warnings = checkDuplicateLocations(candidate, existingLocations);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('North Sydney');
    expect(warnings[0]).toContain('already exists');
  });

  it('detects duplicate name (case-insensitive)', () => {
    const candidate = { name: 'NORTH SYDNEY', address: '1 Other St', phone: '+61 499999999' };
    const warnings = checkDuplicateLocations(candidate, existingLocations);
    expect(warnings.some(w => w.includes('already exists'))).toBe(true);
  });

  it('detects duplicate name (with whitespace)', () => {
    const candidate = { name: '  North Sydney  ', address: '1 Other St', phone: '+61 499999999' };
    const warnings = checkDuplicateLocations(candidate, existingLocations);
    expect(warnings.some(w => w.includes('already exists'))).toBe(true);
  });

  it('detects duplicate address', () => {
    const candidate = { name: 'New Location', address: '100 Miller St, North Sydney NSW 2060', phone: '+61 499999999' };
    const warnings = checkDuplicateLocations(candidate, existingLocations);
    expect(warnings.some(w => w.includes('already used by'))).toBe(true);
  });

  it('detects duplicate phone number (ignoring whitespace)', () => {
    const candidate = { name: 'New Loc', address: '1 St', phone: '+61411111111' };
    const warnings = checkDuplicateLocations(candidate, existingLocations);
    expect(warnings.some(w => w.includes('Phone number'))).toBe(true);
  });

  it('ignores phone numbers shorter than 4 chars', () => {
    const candidate = { name: 'New Loc', address: '1 St', phone: '+61' };
    expect(checkDuplicateLocations(candidate, existingLocations)).toEqual([]);
  });

  it('excludes the editing location from duplicate check', () => {
    const candidate = { name: 'North Sydney', address: '100 Miller St, North Sydney NSW 2060', phone: '+61 411111111' };
    const warnings = checkDuplicateLocations(candidate, existingLocations, 'loc1');
    expect(warnings).toEqual([]);
  });

  it('detects multiple duplicate fields at once', () => {
    const candidate = { name: 'North Sydney', address: '100 Miller St, North Sydney NSW 2060', phone: '+61 411111111' };
    const warnings = checkDuplicateLocations(candidate, existingLocations);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty candidate fields gracefully', () => {
    const candidate = { name: '', address: '', phone: '' };
    expect(checkDuplicateLocations(candidate, existingLocations)).toEqual([]);
  });

  it('handles null/undefined candidate fields', () => {
    const candidate = { name: null, address: undefined, phone: '' };
    expect(checkDuplicateLocations(candidate, existingLocations)).toEqual([]);
  });
});

// ── validateBookingFields ────────────────────────────────────────────────────
describe('validateBookingFields', () => {
  const validBooking = {
    customerName: 'Alice Smith',
    customerEmail: 'alice@example.com',
    customerPhone: '0411111111',
    locationId: 'loc1',
    date: '2026-03-15',
    time: '10:00',
  };

  it('returns no errors for a valid booking', () => {
    expect(validateBookingFields(validBooking)).toEqual({});
  });

  it('returns error for missing customer name', () => {
    const errors = validateBookingFields({ ...validBooking, customerName: '' });
    expect(errors.customerName).toBeDefined();
  });

  it('returns error for name exceeding 200 characters', () => {
    const errors = validateBookingFields({ ...validBooking, customerName: 'A'.repeat(201) });
    expect(errors.customerName).toContain('200');
  });

  it('returns error for missing customer email', () => {
    const errors = validateBookingFields({ ...validBooking, customerEmail: '' });
    expect(errors.customerEmail).toBeDefined();
  });

  it('returns error for missing customer phone', () => {
    const errors = validateBookingFields({ ...validBooking, customerPhone: '' });
    expect(errors.customerPhone).toBeDefined();
  });

  it('returns error for missing locationId', () => {
    const errors = validateBookingFields({ ...validBooking, locationId: '' });
    expect(errors.locationId).toBeDefined();
  });

  it('returns error for missing date', () => {
    const errors = validateBookingFields({ ...validBooking, date: '' });
    expect(errors.date).toBeDefined();
  });

  it('returns error for missing time', () => {
    const errors = validateBookingFields({ ...validBooking, time: '' });
    expect(errors.time).toBeDefined();
  });

  it('returns multiple errors when multiple fields are invalid', () => {
    const errors = validateBookingFields({ customerName: '', customerEmail: '', customerPhone: '', locationId: '', date: '', time: '' });
    expect(Object.keys(errors).length).toBe(6);
  });

  it('trims whitespace-only strings as empty', () => {
    const errors = validateBookingFields({ ...validBooking, customerName: '   ' });
    expect(errors.customerName).toBeDefined();
  });
});
