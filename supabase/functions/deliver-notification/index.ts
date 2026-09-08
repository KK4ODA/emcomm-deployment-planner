// deliver-notification
//
// Called by the database (trigger + pg_net) for every deliverable
// notification row, and by the app (GET) to learn which channels this server
// can use. Delivers by web push (always available: VAPID keys are generated
// here on first use and kept in app_config), email (when RESEND_API_KEY and
// EMAIL_FROM are set) and SMS (when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
// TWILIO_FROM are set), according to the operator's notification_prefs.
//
// verify_jwt is off because the database calls this without a user token;
// the call is authenticated with the hook secret from app_config instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-emcomm-hook',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const EMAIL_READY = !!(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM'))
const SMS_READY = !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_FROM'))
const APP_URL = Deno.env.get('APP_URL') || 'https://emcommplanner.org'
const CONTACT = Deno.env.get('VAPID_SUBJECT') || `mailto:admin@${new URL(APP_URL).hostname}`

async function config(key: string): Promise<string | null> {
  const { data } = await admin.from('app_config').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}
async function setConfig(key: string, value: string) {
  await admin.from('app_config').upsert({ key, value, updated_at: new Date().toISOString() })
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0))

/** VAPID keys live in app_config as JWK; generated once. Returns the raw public key for the browser too. */
async function vapid() {
  let stored = await config('vapid_keys')
  if (!stored) {
    const keys = await webpush.generateVapidKeys({ extractable: true })
    const exported = await webpush.exportVapidKeys(keys)
    stored = JSON.stringify(exported)
    await setConfig('vapid_keys', stored)
  }
  const jwk = JSON.parse(stored) as { publicKey: JsonWebKey; privateKey: JsonWebKey }
  const raw = new Uint8Array(65)
  raw[0] = 4
  raw.set(fromB64url(jwk.publicKey.x!), 1)
  raw.set(fromB64url(jwk.publicKey.y!), 33)
  const imported = await webpush.importVapidKeys(jwk, { extractable: false })
  return { jwk, publicKey: b64url(raw), imported }
}

const URL_FOR: Record<string, string> = {
  assignment_offered: '/my-assignments', assignment_accepted: '/staffing', assignment_declined: '/staffing',
  plan_published: '/packet', open_shift: '/my-assignments', info: '/',
}

async function sendPush(userId: string, payload: { title: string; body: string; url: string; tag: string }) {
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  if (!subs?.length) return { sent: 0, removed: 0 }
  const { imported } = await vapid()
  const server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: imported })
  let sent = 0, removed = 0
  for (const s of subs) {
    try {
      const subscriber = server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
      await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: 6 * 3600, urgency: 'high' })
      sent += 1
      await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString(), failures: 0 }).eq('id', s.id)
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status ?? (err as { status?: number })?.status
      if (status === 404 || status === 410 || (s.failures ?? 0) >= 5) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
        removed += 1
      } else {
        await admin.from('push_subscriptions').update({ failures: (s.failures ?? 0) + 1 }).eq('id', s.id)
      }
      console.warn('push failed', s.endpoint.slice(0, 40), (err as Error).message)
    }
  }
  return { sent, removed }
}

async function sendEmail(to: string, subject: string, text: string) {
  if (!EMAIL_READY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM'), to: [to], subject, text }),
  })
  if (!res.ok) console.warn('email failed', res.status, await res.text())
  return res.ok
}

function e164(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

async function sendSms(phone: string | null, text: string) {
  const to = e164(phone)
  if (!SMS_READY || !to) return false
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const body = new URLSearchParams({ To: to, From: Deno.env.get('TWILIO_FROM')!, Body: text.slice(0, 320) })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) console.warn('sms failed', res.status, await res.text())
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Status for the app: which channels work here, and the push public key.
  if (req.method === 'GET') {
    const apikey = req.headers.get('apikey') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (apikey !== ANON_KEY && !(req.headers.get('authorization') || '').startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    try {
      const { publicKey } = await vapid()
      return json({ push: { available: true, publicKey }, email: { available: EMAIL_READY }, sms: { available: SMS_READY } })
    } catch (err) {
      return json({ push: { available: false, error: (err as Error).message }, email: { available: EMAIL_READY }, sms: { available: SMS_READY } })
    }
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = await config('hook_secret')
  if (!secret || req.headers.get('x-emcomm-hook') !== secret) return json({ error: 'Unauthorized' }, 401)

  try {
    const { record } = await req.json()
    if (!record?.user_email) return json({ skipped: 'no recipient' })
    const { data: user } = await admin.from('users').select('id, phone, notification_prefs, call_sign, aprs_call_sign, ares_group_ids').eq('email', record.user_email).maybeSingle()
    if (!user) return json({ skipped: 'unknown user' })
    const prefs = { push: true, email: false, sms: false, aprs: false, ...(user.notification_prefs || {}) }
    const title = record.title || 'EmComm Planner'
    const body = record.message || ''
    const url = `${APP_URL}${URL_FOR[record.type] || '/'}`
    const result: Record<string, unknown> = {}
    if (prefs.push) result.push = await sendPush(user.id, { title, body, url, tag: `${record.type}:${record.id}` })
    if (prefs.email) result.email = await sendEmail(record.user_email, `[EmComm] ${title}`, `${body}\n\n${url}`)
    if (prefs.sms) result.sms = await sendSms(user.phone, `${title}: ${body}`.slice(0, 300))
    if (prefs.aprs && user.aprs_call_sign) {
      // One APRS message per group bridge the operator belongs to; the bridge sends it through Graywolf.
      const groups: string[] = Array.isArray(user.ares_group_ids) ? user.ares_group_ids : []
      const { data: bridges } = groups.length ? await admin.from('aprs_bridges').select('ares_group_id').in('ares_group_id', groups).is('revoked_at', null) : { data: [] }
      const groupIds = [...new Set((bridges ?? []).map((b: { ares_group_id: string }) => b.ares_group_id))]
      const short = `${title}${body ? `: ${body}` : ''}`.replace(/\s+/g, ' ').trim()
      const msg = short.length <= 67 ? short : short.slice(0, 66) + '~'
      for (const gid of groupIds) await admin.from('aprs_outbox').insert({ ares_group_id: gid, to_callsign: String(user.aprs_call_sign).toUpperCase(), text: msg, notification_id: record.id })
      result.aprs = groupIds.length
    }
    return json({ ok: true, ...result })
  } catch (err) {
    console.error('deliver failed', err)
    return json({ error: (err as Error).message }, 500)
  }
})
