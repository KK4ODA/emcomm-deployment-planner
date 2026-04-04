// Validates amateur radio callsign format
// Pattern: 1-2 letters + 1 digit + 1-3 letters (e.g., W1ABC, KA2XYZ, N3A, K4VER)
// Also supports APRS format with SSID suffix (e.g., W1ABC-9)
export const CALLSIGN_REGEX = /^[A-Z]{1,2}\d[A-Z]{1,3}(-\d{1,2})?$/;

// Validates email format
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidCallsign(callsign) {
  if (!callsign || typeof callsign !== 'string') {
    return false;
  }
  
  const cleaned = callsign.trim().toUpperCase();
  return CALLSIGN_REGEX.test(cleaned);
}

export function validateCallsign(callsign) {
  if (!callsign) {
    return { isValid: true, error: null }; // Empty is allowed (optional field)
  }
  
  const isValid = isValidCallsign(callsign);
  
  return {
    isValid,
    error: isValid ? null : 'Invalid callsign format (e.g., W1ABC, KA2XYZ)'
  };
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const cleaned = email.trim();
  return EMAIL_REGEX.test(cleaned);
}

export function validateEmail(email) {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }
  
  const isValid = isValidEmail(email);
  
  return {
    isValid,
    error: isValid ? null : 'Invalid email format'
  };
}