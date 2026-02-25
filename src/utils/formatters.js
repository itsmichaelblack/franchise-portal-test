// src/utils/formatters.js
// Pure formatting functions extracted from App.jsx for testability.

/**
 * Format a Firestore timestamp, Date object, or string into a human-readable date.
 * Handles Firestore Timestamps (with .toDate()), plain Date objects,
 * objects with a .seconds property, and plain strings.
 */
export function formatDateValue(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val?.toDate) return val.toDate().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  if (val instanceof Date) return val.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  if (val?.seconds) return new Date(val.seconds * 1000).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  return String(val);
}

/**
 * Format a Date object into a full UTC datetime string like "2026-02-25 14:30:00 UTC".
 */
export function formatUTCDate(date) {
  if (!date) return '—';
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/**
 * Format a Date object into a human-friendly relative time string.
 * Examples: "Just now", "5m ago", "2h ago", "3d ago", "1mo ago".
 */
export function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Format a 24-hour time string ("14:30") to 12-hour format ("2:30 PM").
 */
export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Map an action type string to a CSS class name for badge styling.
 */
export function getActionBadgeClass(action) {
  const map = { sign_in: 'sign_in', sign_out: 'sign_out', edit: 'edit', create: 'create', delete: 'delete', update: 'update', view: 'view' };
  return map[action] || 'default';
}

/**
 * Map an action type string to a human-readable display label.
 */
export function getActionLabel(action) {
  const map = { sign_in: 'Sign In', sign_out: 'Sign Out', edit: 'Edit', create: 'Create', delete: 'Delete', update: 'Update', view: 'View', resend_email: 'Resend Email' };
  return map[action] || action;
}

/**
 * Build a summary string from an action counts object.
 * Example: { sign_in: 3, edit: 2, view: 1 } -> "3 sign-ins, 2 edits, 1 other"
 */
export function buildSummary(actionCounts) {
  const parts = [];
  if (actionCounts.sign_in) parts.push(`${actionCounts.sign_in} sign-in${actionCounts.sign_in > 1 ? 's' : ''}`);
  if (actionCounts.edit) parts.push(`${actionCounts.edit} edit${actionCounts.edit > 1 ? 's' : ''}`);
  if (actionCounts.create) parts.push(`${actionCounts.create} create${actionCounts.create > 1 ? 's' : ''}`);
  if (actionCounts.delete) parts.push(`${actionCounts.delete} deletion${actionCounts.delete > 1 ? 's' : ''}`);
  const otherCount = Object.entries(actionCounts).filter(([k]) => !['sign_in', 'edit', 'create', 'delete'].includes(k)).reduce((s, [, v]) => s + v, 0);
  if (otherCount) parts.push(`${otherCount} other`);
  return parts.join(', ') || 'No actions';
}
