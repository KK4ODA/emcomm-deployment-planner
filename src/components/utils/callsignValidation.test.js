import { describe, it, expect } from 'vitest';
import { isValidCallsign, validateCallsign, isValidEmail, validateEmail } from './callsignValidation.jsx';

describe('call sign validation', () => {
  it.each(['W1ABC', 'KA2XYZ', 'N3A', 'K4VER', 'KK4ODA', 'w1abc', ' W1ABC '])('accepts %s', (cs) => {
    expect(isValidCallsign(cs)).toBe(true);
  });

  it.each(['W1ABC-9', 'KK4ODA-7', 'N3A-15'])('accepts APRS SSID form %s', (cs) => {
    expect(isValidCallsign(cs)).toBe(true);
  });

  it.each(['', '1ABC', 'WABC', 'W12ABC', 'W1ABCD', 'W1ABC-123', 'HELLO', null, undefined, 42])('rejects %s', (cs) => {
    expect(isValidCallsign(cs)).toBe(false);
  });

  it('treats an empty call sign as valid (optional field)', () => {
    expect(validateCallsign('')).toEqual({ isValid: true, error: null });
  });

  it('returns an error message for an invalid call sign', () => {
    const r = validateCallsign('NOPE');
    expect(r.isValid).toBe(false);
    expect(r.error).toMatch(/Invalid callsign/);
  });
});

describe('email validation', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('op@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.org')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@example.com')).toBe(false);
  });

  it('requires a value', () => {
    expect(validateEmail('')).toEqual({ isValid: false, error: 'Email is required' });
    expect(validateEmail('bad').error).toBe('Invalid email format');
    expect(validateEmail('ok@example.com').isValid).toBe(true);
  });
});
