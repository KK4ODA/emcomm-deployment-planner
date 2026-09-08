/**
 * Notification preferences (design doc 9.20): per operator, which channels
 * carry assignment changes, plan changes and open-shift offers. In-app is
 * always on. Pure helpers.
 */

export const CHANNELS = Object.freeze([
  { id: 'push', label: 'Push to this device', hint: 'Appears on your phone or desktop even when the app is closed. Best for event-day changes.' },
  { id: 'email', label: 'Email', hint: 'One email per notification, no digests. Slower than push.' },
  { id: 'sms', label: 'Text message (SMS)', hint: 'Uses the phone number on your profile. Only for the few things that cannot wait.' },
  { id: 'aprs', label: 'APRS message', hint: 'Sent over the air by the group\'s Graywolf station to your APRS call. Works with no phone signal; 67 characters.' },
]);

export const DEFAULT_PREFS = Object.freeze({ push: true, email: false, sms: false, aprs: false });

/** Fill gaps in a stored prefs object. */
export function normalizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return { push: p.push !== false, email: p.email === true, sms: p.sms === true, aprs: p.aprs === true };
}

/** Notification types that leave the app; everything else stays in the bell. */
export const DELIVERED_TYPES = Object.freeze(['assignment_offered', 'assignment_accepted', 'assignment_declined', 'plan_published', 'open_shift', 'info']);

/**
 * Whether a channel can be turned on here, with the reason when it cannot.
 * @param {string} channel
 * @param {{ status?: { push?: { available?: boolean }, email?: { available?: boolean }, sms?: { available?: boolean } }|null, pushSupported?: boolean, permission?: string, phone?: string|null, aprsCall?: string|null, aprsBridge?: boolean }} ctx
 * @returns {{ ok: boolean, reason?: string }}
 */
export function channelAvailability(channel, { status = null, pushSupported = true, permission = 'default', phone = null, aprsCall = null, aprsBridge = true } = {}) {
  if (channel === 'push') {
    if (!pushSupported) return { ok: false, reason: 'This browser or app cannot receive push notifications. Use the web app on your phone.' };
    if (permission === 'denied') return { ok: false, reason: 'Notifications are blocked for this site in your browser settings.' };
    if (status && status.push && status.push.available === false) return { ok: false, reason: 'Push is not configured on this server.' };
    return { ok: true };
  }
  if (channel === 'email') {
    if (status && status.email && status.email.available === false) return { ok: false, reason: 'Email delivery is not configured on this server; ask the administrator.' };
    return { ok: true };
  }
  if (channel === 'sms') {
    if (status && status.sms && status.sms.available === false) return { ok: false, reason: 'Text messages are not configured on this server; ask the administrator.' };
    if (!phone) return { ok: false, reason: 'Add a phone number to your profile first.' };
    return { ok: true };
  }
  if (channel === 'aprs') {
    if (!aprsCall) return { ok: false, reason: 'Add your APRS call sign (with SSID) to your profile first.' };
    if (!aprsBridge) return { ok: false, reason: 'Your group has no Graywolf bridge yet; ask the coordinator.' };
    return { ok: true };
  }
  return { ok: false, reason: 'Unknown channel' };
}
