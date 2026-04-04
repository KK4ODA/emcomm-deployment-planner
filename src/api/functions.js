import { supabase } from './supabaseClient';

/**
 * Invoke a Supabase Edge Function.
 * Mimics the Base44 `base44.functions.invoke(name, payload)` interface.
 *
 * @param {string} name - Function name (e.g. 'exportDeployment')
 * @param {Object} payload - Request body
 * @returns {Object} { data } - The response data
 */
export async function invokeFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, {
    body: payload
  });
  if (error) throw error;
  return { data };
}
