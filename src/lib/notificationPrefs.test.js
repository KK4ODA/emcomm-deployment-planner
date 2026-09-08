import { describe, it, expect } from 'vitest';
import { normalizePrefs, channelAvailability } from './notificationPrefs';

describe('normalizePrefs', () => {
  it('defaults push on and the rest off', () => {
    expect(normalizePrefs(null)).toEqual({ push: true, email: false, sms: false, aprs: false });
    expect(normalizePrefs({ push: false, email: true, sms: 'yes', aprs: true })).toEqual({ push: false, email: true, sms: false, aprs: true });
  });
});

describe('channelAvailability', () => {
  const status = { push: { available: true }, email: { available: false }, sms: { available: true } };
  it('explains why a channel is off', () => {
    expect(channelAvailability('push', { status, pushSupported: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot receive push/) });
    expect(channelAvailability('push', { status, permission: 'denied' }).ok).toBe(false);
    expect(channelAvailability('push', { status })).toEqual({ ok: true });
    expect(channelAvailability('email', { status }).reason).toMatch(/not configured/);
    expect(channelAvailability('sms', { status, phone: null }).reason).toMatch(/phone number/);
    expect(channelAvailability('sms', { status, phone: '404-555-0100' })).toEqual({ ok: true });
    expect(channelAvailability('aprs', { aprsCall: null }).reason).toMatch(/APRS call/);
    expect(channelAvailability('aprs', { aprsCall: 'KK4ODA-7', aprsBridge: false }).reason).toMatch(/bridge/);
    expect(channelAvailability('aprs', { aprsCall: 'KK4ODA-7' })).toEqual({ ok: true });
  });
  it('is permissive before the server status is known', () => {
    expect(channelAvailability('email', {})).toEqual({ ok: true });
  });
});
