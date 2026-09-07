/**
 * Amateur radio call sign helpers.
 * Pattern: 1-2 letter prefix, 1 digit, 1-3 letter suffix (W1ABC, KA2XYZ, N3A),
 * optionally followed by an APRS SSID (-0 to -15, e.g. W1ABC-9).
 */
export const CALLSIGN_REGEX = /^[A-Z]{1,2}\d[A-Z]{1,3}(-\d{1,2})?$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Uppercase and trim a call sign as the user types. */
export function normalizeCallsign(value) {
  return (value ?? '').toString().trim().toUpperCase();
}

export function isValidCallsign(callsign) {
  if (!callsign || typeof callsign !== 'string') return false;
  return CALLSIGN_REGEX.test(normalizeCallsign(callsign));
}

/** @returns {{ isValid: boolean, error: string|null }} empty input is valid (optional field) */
export function validateCallsign(callsign) {
  if (!callsign) return { isValid: true, error: null };
  const isValid = isValidCallsign(callsign);
  return { isValid, error: isValid ? null : 'Invalid callsign format (e.g., W1ABC, KA2XYZ)' };
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/** @returns {{ isValid: boolean, error: string|null }} */
export function validateEmail(email) {
  if (!email) return { isValid: false, error: 'Email is required' };
  const isValid = isValidEmail(email);
  return { isValid, error: isValid ? null : 'Invalid email format' };
}
