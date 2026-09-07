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
 * ICS 205 form data for client-side PDF rendering.
 * @param {string} formId
 * @returns {Promise<{ form: Object, locationName: string }>}
 */
export function fetchIcs205Export(formId) {
  return invokeFunction('export-ics205', { formId });
}

/**
 * Invite a new member by email. Requires admin or operator role.
 * @param {{ email: string, role?: string, aresGroupIds?: string[] }} params
 */
export function inviteUser({ email, role, aresGroupIds }) {
  return invokeFunction('invite-user', { email, role, aresGroupIds });
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

/**
 * Look up the what3words address for a coordinate pair.
 * @param {number} lat @param {number} lng
 * @returns {Promise<{ words: string, nearestPlace?: string, map?: string }>}
 */
export function lookupWhat3Words(lat, lng) {
  return invokeFunction('get-what3words', { lat, lng });
}
