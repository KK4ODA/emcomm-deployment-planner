import { supabase } from './supabaseClient';
import { TABLES } from './db';

/**
 * @typedef {Object} UserProfile
 * @property {string} id
 * @property {string} email
 * @property {string} full_name
 * @property {string} [call_sign]
 * @property {string} [phone]
 * @property {string} [aprs_call_sign]
 * @property {'admin'|'planner'|'operator'|'viewer'|'pending'} app_role
 * @property {string[]} ares_group_ids server-maintained mirror of active memberships (read-only)
 * @property {string|null} [profile_image_url]
 * @property {string|null} [license_class]
 * @property {{ push?: boolean, email?: boolean, sms?: boolean }} [notification_prefs]
 * @property {string[]} [capabilities]
 * @property {string[]} [station_types]
 * @property {number|null} [power_hours]
 * @property {string|null} [locality]
 * @property {string|null} [equipment_notes]
 */

// Group membership is not here on purpose: it changes through `memberships`
// rows (requests and admin approval), never by editing the profile row.
const PROFILE_FIELDS = [
  'call_sign', 'phone', 'aprs_call_sign', 'full_name', 'profile_image_url',
  'license_class', 'capabilities', 'station_types', 'power_hours', 'locality', 'equipment_notes',
  'notification_prefs',
];

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  return unwrap(await supabase.auth.signInWithPassword({ email, password }));
}

export async function signUp({ email, password, fullName }) {
  return unwrap(await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  }));
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** @param {string} email @param {string} redirectTo absolute URL of the reset page */
export async function requestPasswordReset(email, redirectTo) {
  unwrap(await supabase.auth.resetPasswordForEmail(email, { redirectTo }));
}

export async function updatePassword(newPassword) {
  unwrap(await supabase.auth.updateUser({ password: newPassword }));
}

/** Changes the sign-in email; Supabase sends a confirmation to the new address. */
export async function updateEmail(newEmail) {
  unwrap(await supabase.auth.updateUser({ email: newEmail }));
}

/**
 * Current Supabase session, or null. Bounded by a timeout so a hung network
 * stack falls through to the cached identity quickly.
 */
export async function getSessionWithTimeout(timeoutMs = 3000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('getSession timeout')), timeoutMs));
  try {
    const result = await Promise.race([supabase.auth.getSession(), timeout]);
    return result?.data?.session ?? null;
  } catch {
    return null;
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * Build the minimal profile used when the users row does not exist yet
 * (the auth trigger has not run, or was bypassed).
 * @returns {UserProfile}
 */
export function profileFromAuthUser(authUser) {
  return {
    id: authUser.id,
    email: authUser.email,
    full_name: authUser.user_metadata?.full_name || '',
    app_role: 'pending',
    ares_group_ids: [],
  };
}

/**
 * Load the application profile for an auth user.
 * @returns {Promise<UserProfile>}
 */
export async function fetchProfile(authUser) {
  const { data, error } = await supabase
    .from(TABLES.users)
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error) throw error;
  return data ?? profileFromAuthUser(authUser);
}

/**
 * Update editable profile fields for a user. Unknown keys are dropped so a
 * form object can be passed straight through.
 * @param {string} userId
 * @param {Partial<UserProfile>} patch
 * @returns {Promise<UserProfile>}
 */
export async function updateProfile(userId, patch) {
  const clean = {};
  for (const key of PROFILE_FIELDS) if (key in patch) clean[key] = patch[key];
  return unwrap(await supabase.from(TABLES.users).update(clean).eq('id', userId).select().single());
}

// ─── Cached identity ──────────────────────────────────────────────────────────
// The profile is persisted so the app can open while the backend is
// unreachable (service worker serves the shell, IndexedDB serves data).

export const CACHED_IDENTITY_KEY = 'emcomm_cached_identity';
export const CACHED_IDENTITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function saveCachedIdentity(profile, now = Date.now()) {
  try {
    localStorage.setItem(CACHED_IDENTITY_KEY, JSON.stringify({
      profile,
      issued_at: now,
      expires_at: now + CACHED_IDENTITY_TTL_MS,
    }));
  } catch { /* storage full or denied */ }
}

/** @returns {UserProfile|null} */
export function readCachedIdentity(now = Date.now()) {
  try {
    const raw = localStorage.getItem(CACHED_IDENTITY_KEY);
    if (!raw) return null;
    const bundle = JSON.parse(raw);
    if (!bundle?.profile || !bundle?.expires_at) return null;
    if (bundle.expires_at < now) return null;
    return bundle.profile;
  } catch {
    return null;
  }
}

export function clearCachedIdentity() {
  try { localStorage.removeItem(CACHED_IDENTITY_KEY); } catch { /* ignore */ }
}
