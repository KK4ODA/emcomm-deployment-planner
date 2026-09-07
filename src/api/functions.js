import { supabase } from './supabaseClient';

/**
 * Turn a Supabase Functions error into an Error with a message a user can read.
 * `FunctionsHttpError` carries the HTTP response in `context`; our functions
 * return `{ error: string }` bodies on failure.
 */
export async function describeFunctionError(error) {
  const fallback = error?.message || 'Request failed';
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.clone().json();
      if (body?.error) return new Error(body.error);
    } catch {
      /* body was not JSON */
    }
  }
  return new Error(fallback);
}

/**
 * Invoke a Supabase Edge Function and return its response body.
 * @param {string} name function slug, e.g. 'export-deployment'
 * @param {Object} [body]
 */
export async function invokeFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await describeFunctionError(error);
  return data;
}

/**
 * Plain-text deployment export.
 * @param {{ deploymentId: string, includeGoKit?: boolean }} params
 * @returns {Promise<string>}
 */
export function exportDeployment({ deploymentId, includeGoKit = true }) {
  return invokeFunction('export-deployment', { deploymentId, format: 'txt', includeGoKit });
}

/**
 * Invite a new member by email, or add an existing member to groups.
 * Requires admin or planner role. Profile fields fill empty columns only.
 * @param {{ email: string, role?: string, aresGroupIds?: string[], call_sign?: string|null, full_name?: string|null, phone?: string|null, license_class?: string|null }} params
 * @returns {Promise<{ success: boolean, existing?: boolean, message: string }>}
 */
export function inviteUser({ email, role, aresGroupIds, call_sign, full_name, phone, license_class }) {
  return invokeFunction('invite-user', { email, role, aresGroupIds, call_sign, full_name, phone, license_class });
}

/**
 * Admin-only: create (invite) or update a member profile by email.
 * @param {{ email: string, full_name: string, call_sign: string, phone: string, aprs_call_sign?: string }} profile
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export function upsertMemberProfile(profile) {
  return invokeFunction('create-or-update-user-profile', profile);
}

/**
 * Remove a deleted member's call sign from item, site and task assignments.
 * @param {string} callSign
 */
export function cleanupDeletedUser(callSign) {
  return invokeFunction('cleanup-deleted-user', { callSign });
}
