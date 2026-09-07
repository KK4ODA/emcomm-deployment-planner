/**
 * Browser side of web push: subscribe this device with the server's VAPID
 * public key, read the current subscription, unsubscribe. The service
 * worker (public/push-sw.js, imported by the generated worker) shows the
 * notifications.
 */

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** The active subscription for this device, if any. */
export async function currentSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Ask permission and subscribe. Resolves to the subscription JSON
 * ({ endpoint, keys: { p256dh, auth } }) or throws with a readable message.
 * @param {string} vapidPublicKey base64url
 */
export async function subscribePush(vapidPublicKey) {
  if (!isPushSupported()) throw new Error('This browser cannot receive push notifications');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed');
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing.toJSON();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  return sub.toJSON();
}

/** Unsubscribe this device. Resolves to the endpoint that was removed, or null. */
export async function unsubscribePush() {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
