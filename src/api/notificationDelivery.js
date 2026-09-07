import { supabase } from './supabaseClient';
import { TABLES } from './db';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/**
 * Which delivery channels this server can use, plus the push public key.
 * @returns {Promise<{ push: { available: boolean, publicKey?: string }, email: { available: boolean }, sms: { available: boolean } }>}
 */
export async function getDeliveryStatus() {
  const { data, error } = await supabase.functions.invoke('deliver-notification', { method: 'GET' });
  if (error) throw error;
  return data;
}

/** Remember this device's push subscription for the signed-in user. */
export async function savePushSubscription(userId, subscription) {
  return unwrap(await supabase.from(TABLES.pushSubscriptions).upsert({
    user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.keys?.p256dh, auth: subscription.keys?.auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
  }, { onConflict: 'endpoint' }).select().single());
}

export async function removePushSubscription(endpoint) {
  unwrap(await supabase.from(TABLES.pushSubscriptions).delete().eq('endpoint', endpoint));
}

/** All of the user's registered devices. */
export async function listPushSubscriptions(userId) {
  return unwrap(await supabase.from(TABLES.pushSubscriptions).select('id, endpoint, user_agent, created_at, last_used_at').eq('user_id', userId).order('created_at'));
}
