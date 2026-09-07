import { format, isValid, parseISO } from 'date-fns';

/** "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export function relativeTime(dateString, now = new Date()) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

/** Format a DATE column ("2026-05-05") without timezone shifting. */
export function formatDate(value, pattern = 'MMM d, yyyy') {
  if (!value) return '';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? format(date, pattern) : '';
}

export function formatDateTime(value, pattern = 'MMM d, yyyy HH:mm') {
  return formatDate(value, pattern);
}

/** Value for an <input type="datetime-local"> from an ISO/timestamptz string. */
export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Filename-safe timestamp, e.g. 2026-05-05T18-42-11 */
export function fileTimestamp(now = new Date()) {
  return now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
}
