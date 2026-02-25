// src/utils/validators.js
// Validation logic extracted from App.jsx for testability.

/**
 * Check for duplicate locations by name, address, or phone number.
 * Returns an array of warning strings (empty if no duplicates found).
 *
 * @param {{ name: string, address: string, phone: string }} candidate - The new location data to check
 * @param {Array<{ id: string, name?: string, address?: string, phone?: string }>} existingLocations - Existing locations to check against
 * @param {string|null} editingId - If editing, exclude this location's ID from the check
 * @returns {string[]} Array of warning messages
 */
export function checkDuplicateLocations(candidate, existingLocations, editingId = null) {
  const others = existingLocations.filter(l => l.id !== editingId);
  const warnings = [];

  if (candidate.name && candidate.name.trim()) {
    const match = others.find(l => l.name?.toLowerCase().trim() === candidate.name.toLowerCase().trim());
    if (match) warnings.push(`Location name "${candidate.name}" already exists`);
  }

  if (candidate.address && candidate.address.trim()) {
    const match = others.find(l => l.address?.toLowerCase().trim() === candidate.address.toLowerCase().trim());
    if (match) warnings.push(`Address "${candidate.address}" is already used by "${match.name}"`);
  }

  if (candidate.phone && candidate.phone.trim() && candidate.phone.trim().length > 3) {
    const match = others.find(l => l.phone?.replace(/\s/g, '') === candidate.phone.replace(/\s/g, ''));
    if (match) warnings.push(`Phone number is already used by "${match.name}"`);
  }

  return warnings;
}

/**
 * Validate required booking form fields.
 * Returns an object with field-level error messages (empty object if all valid).
 *
 * @param {{ customerName: string, customerEmail: string, customerPhone: string, locationId: string, date: string, time: string }} booking
 * @returns {Record<string, string>} Field-level errors
 */
export function validateBookingFields(booking) {
  const errors = {};

  if (!booking.customerName || !booking.customerName.trim()) {
    errors.customerName = 'Name is required';
  } else if (booking.customerName.length > 200) {
    errors.customerName = 'Name must be 200 characters or less';
  }

  if (!booking.customerEmail || !booking.customerEmail.trim()) {
    errors.customerEmail = 'Email is required';
  }

  if (!booking.customerPhone || !booking.customerPhone.trim()) {
    errors.customerPhone = 'Phone number is required';
  }

  if (!booking.locationId) {
    errors.locationId = 'Location is required';
  }

  if (!booking.date) {
    errors.date = 'Date is required';
  }

  if (!booking.time) {
    errors.time = 'Time is required';
  }

  return errors;
}
