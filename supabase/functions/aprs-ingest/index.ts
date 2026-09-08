// aprs-ingest
//
// The server side of the Graywolf integration. A bridge running next to
// Graywolf (emcomm-objects, or anything that can call HTTP) authenticates
// with a per-group bridge token and:
//
//   POST /aprs-ingest/stations   { stations: [StationDTO...] }  heard stations -> aprs_positions
//   POST /aprs-ingest/action     Graywolf Action webhook: @@#checkin | #onpos | #checkout | #status
//   GET  /aprs-ingest/outbox     pending APRS messages for the bridge to send
//   POST /aprs-ingest/outbox/ack { id, ok, error }             mark sent / failed
//   GET  /aprs-ingest/objects?deployment=<id|active>&format=json|csv
//                                the deployment's sites as APRS objects (emcomm-objects shape)
//   GET  /aprs-ingest/ping       token check; reports the group and bridge name
//
// Token: "Authorization: Bearer <token>" or "?token=" (Graywolf webhook URLs
// can carry it). Only the SHA-256 of the token is stored.
// verify_jwt is off; every route checks the bridge token itself.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-emcomm-token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const text = (body: string, status = 200) => new Response(body, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } })

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

type Bridge = { id: string; ares_group_id: string; name: string; revoked_at: string | null }

async function authenticate(req: Request, url: URL): Promise<Bridge | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim() || req.headers.get('x-emcomm-token') || url.searchParams.get('token') || ''
  if (!token || token.length < 16) return null
  const { data } = await admin.from('aprs_bridges').select('id, ares_group_id, name, revoked_at').eq('token_hash', await sha256(token)).maybeSingle()
  if (!data || data.revoked_at) return null
  return data as Bridge
}

const baseCall = (cs: string) => String(cs || '').toUpperCase().trim().split('-')[0]
const clean = (cs: string) => String(cs || '').toUpperCase().trim()

// ── stations ─────────────────────────────────────────────────────────────────
type StationDTO = Record<string, unknown>
function positionOf(st: StationDTO): { lat: number; lon: number; speed_kt?: number; course?: number; alt_m?: number } | null {
  const pos = Array.isArray(st.positions) && st.positions.length ? st.positions[0] as Record<string, unknown> : null
  const lat = Number(pos?.lat ?? pos?.latitude ?? st.lat ?? st.latitude)
  const lon = Number(pos?.lon ?? pos?.longitude ?? st.lon ?? st.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6)) return null
  return { lat, lon, speed_kt: num(pos?.speed_kt), course: num(pos?.course), alt_m: pos?.has_alt === false ? undefined : num(pos?.alt_m) }
}
const num = (v: unknown) => (v == null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined)

async function ingestStations(bridge: Bridge, body: { stations?: StationDTO[]; station_call?: string }) {
  const stations = Array.isArray(body.stations) ? body.stations : []
  const rows = []
  for (const st of stations) {
    const callsign = clean(String(st.callsign || ''))
    if (!callsign) continue
    const heard = st.last_heard ? new Date(String(st.last_heard)) : new Date()
    if (Number.isNaN(heard.getTime())) continue
    const p = positionOf(st)
    rows.push({
      ares_group_id: bridge.ares_group_id, bridge_id: bridge.id, callsign, base_call: baseCall(callsign),
      lat: p?.lat ?? null, lon: p?.lon ?? null, course: p?.course ?? null, speed_kt: p?.speed_kt ?? null, alt_m: p?.alt_m ?? null,
      symbol: st.symbol_table || st.symbol_code ? `${st.symbol_table || '/'}${st.symbol_code || ''}` : null,
      comment: st.comment ? String(st.comment).slice(0, 200) : null,
      is_object: !!st.is_object, via: st.via ? String(st.via) : (st.gated ? 'is' : 'rf'),
      heard_at: heard.toISOString(),
    })
  }
  let inserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { error, data } = await admin.from('aprs_positions').upsert(rows.slice(i, i + 200), { onConflict: 'ares_group_id,callsign,heard_at', ignoreDuplicates: true }).select('id')
    if (error) throw error
    inserted += data?.length ?? 0
  }
  await admin.from('aprs_bridges').update({ last_seen_at: new Date().toISOString(), last_stations: stations.length, last_error: null, ...(body.station_call ? { station_call: clean(body.station_call) } : {}) }).eq('id', bridge.id)
  // Housekeeping: keep 14 days of history.
  await admin.from('aprs_positions').delete().eq('ares_group_id', bridge.ares_group_id).lt('heard_at', new Date(Date.now() - 14 * 86400_000).toISOString())
  return { received: stations.length, stored: inserted }
}

// ── actions (check-in over APRS) ─────────────────────────────────────────────
const ACTION_STATUS: Record<string, string> = { checkin: 'checked_in', ci: 'checked_in', onpos: 'on_position', onposition: 'on_position', op: 'on_position', checkout: 'released', co: 'released', released: 'released' }

async function readActionBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || ''
  const out: Record<string, string> = {}
  if (ct.includes('application/json')) {
    const j = await req.json().catch(() => ({}))
    for (const [k, v] of Object.entries(j || {})) out[k] = typeof v === 'string' ? v : JSON.stringify(v)
  } else {
    const t = await req.text()
    for (const [k, v] of new URLSearchParams(t)) out[k] = v
  }
  return out
}

async function handleAction(bridge: Bridge, form: Record<string, string>) {
  const sender = clean(form['sender-callsign'] || form.sender_callsign || form.sender || form.from || '')
  const action = String(form.action || form.name || '').toLowerCase().replace(/^#/, '')
  const args: Record<string, string> = {}
  for (const [k, v] of Object.entries(form)) if (k.startsWith('arg.')) args[k.slice(4)] = v
  const note = args.note || args.msg || args.text || null
  const log = async (result: string, reply: string, extra: Record<string, unknown> = {}) => {
    await admin.from('aprs_actions').insert({ ares_group_id: bridge.ares_group_id, bridge_id: bridge.id, from_callsign: sender || '?', action: action || '?', args, result, reply, ...extra })
    return reply
  }
  if (!sender) return log('error', 'no sender')
  // Match the operator: exact APRS call first, then the base call sign.
  const { data: byAprs } = await admin.from('users').select('id, call_sign').eq('aprs_call_sign', sender).maybeSingle()
  let user = byAprs
  if (!user) {
    const { data: byCall } = await admin.from('users').select('id, call_sign').eq('call_sign', baseCall(sender)).maybeSingle()
    user = byCall
  }
  if (!user) return log('unknown_callsign', `${sender} not a member; set APRS call on your profile`)
  // Group membership guard: the sender must belong to the bridge's group.
  const { data: member } = await admin.from('memberships').select('user_id').eq('user_id', user.id).eq('ares_group_id', bridge.ares_group_id).eq('status', 'active').maybeSingle()
  if (!member) return log('not_allowed', `${user.call_sign} not in this group`, { user_id: user.id })

  if (action === 'status' || action === 'st') {
    const { data: a } = await admin.from('assignments').select('status, shifts(starts_at, positions(name, tactical_callsign))').eq('user_id', user.id).in('status', ['accepted', 'checked_in', 'on_position']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const s = a as unknown as { status: string; shifts?: { positions?: { name?: string; tactical_callsign?: string } } } | null
    return log('ok', s ? `${s.shifts?.positions?.tactical_callsign || s.shifts?.positions?.name || 'position'}: ${s.status.replace('_', ' ')}` : 'no live assignment', { user_id: user.id })
  }
  const status = ACTION_STATUS[action]
  if (!status) return log('not_allowed', 'use #checkin #onpos #checkout #status', { user_id: user.id })
  const { data, error } = await admin.rpc('apply_aprs_status', { p_user_id: user.id, p_status: status, p_at: new Date().toISOString(), p_note: note })
  if (error) return log('error', 'server error, tell net control', { user_id: user.id })
  const r = data as { result: string; reply: string; assignment_id?: string }
  return log(r.result, r.reply, { user_id: user.id, assignment_id: r.assignment_id ?? null })
}

// ── outbox ───────────────────────────────────────────────────────────────────
async function listOutbox(bridge: Bridge) {
  await admin.from('aprs_outbox').update({ status: 'expired' }).eq('ares_group_id', bridge.ares_group_id).eq('status', 'pending').lt('expires_at', new Date().toISOString())
  const { data, error } = await admin.from('aprs_outbox').select('id, to_callsign, text, created_at, attempts').eq('ares_group_id', bridge.ares_group_id).eq('status', 'pending').order('created_at').limit(50)
  if (error) throw error
  return { messages: data ?? [] }
}
async function ackOutbox(bridge: Bridge, body: { id?: string; ok?: boolean; error?: string }) {
  if (!body?.id) return { error: 'id required' }
  const { data: row } = await admin.from('aprs_outbox').select('attempts').eq('id', body.id).eq('ares_group_id', bridge.ares_group_id).maybeSingle()
  if (!row) return { error: 'not found' }
  const attempts = (row.attempts ?? 0) + 1
  const patch = body.ok ? { status: 'sent', sent_at: new Date().toISOString(), attempts, last_error: null } : { status: attempts >= 3 ? 'failed' : 'pending', attempts, last_error: String(body.error || 'send failed').slice(0, 200) }
  await admin.from('aprs_outbox').update(patch).eq('id', body.id)
  return { ok: true, status: patch.status }
}

// ── objects (sites as APRS objects, emcomm-objects / Pinpoint shape) ─────────
const SYMBOL_BY_TYPE: Record<string, [string, string]> = {
  eoc: ['/', 'o'], shelter: ['/', 'h'], aid_station: ['/', '+'], water: ['/', 'w'], staging: ['/', 'S'], start: ['/', 'F'], finish: ['/', 'F'],
  net_control: ['/', 'r'], repeater: ['/', 'r'], hospital: ['/', 'h'], command: ['/', 'c'], parking: ['\\', 'P'], other: ['/', '/'],
}
const objectName = (name: string, used: Set<string>) => {
  let base = String(name || 'SITE').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  const words = base.split(' ')
  let n = words.length > 1 ? words.map((w, i) => (i === words.length - 1 && /^\d+$/.test(w) ? w : w.slice(0, Math.max(1, Math.floor(8 / words.length))))).join('') : base
  n = n.slice(0, 9) || 'SITE'
  let out = n, i = 1
  while (used.has(out)) { const suffix = String(i++); out = n.slice(0, 9 - suffix.length) + suffix }
  used.add(out)
  return out
}
async function objects(bridge: Bridge, url: URL) {
  const want = url.searchParams.get('deployment') || 'active'
  let q = admin.from('deployments').select('id, name, status, starts_at').eq('ares_group_id', bridge.ares_group_id)
  q = want === 'active' ? q.in('status', ['active', 'planning']).order('status').order('starts_at', { ascending: false, nullsFirst: false }).limit(1) : q.eq('id', want).limit(1)
  const { data: deps } = await q
  const dep = deps?.[0]
  if (!dep) return json({ error: 'no deployment' }, 404)
  const { data: sites } = await admin.from('deployment_locations').select('id, name, address, lat, lon, site_type, description').eq('deployment_id', dep.id).order('sort_order')
  const { data: positions } = await admin.from('positions').select('id, name, tactical_callsign, site_id, position_type').eq('deployment_id', dep.id)
  const used = new Set<string>()
  const rows = []
  for (const s of sites ?? []) {
    let lat = s.lat, lon = s.lon
    if (lat == null || lon == null) { const m = String(s.address || '').match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/); if (m) { lat = parseFloat(m[1]); lon = parseFloat(m[2]) } }
    if (lat == null || lon == null) continue
    const here = (positions ?? []).filter(p => p.site_id === s.id)
    const tac = here.find(p => p.tactical_callsign)?.tactical_callsign
    const kind = here.some(p => p.position_type === 'net_control') ? 'net_control' : (s.site_type || 'other')
    const [tbl, sym] = SYMBOL_BY_TYPE[kind] || SYMBOL_BY_TYPE.other
    rows.push({
      ObjectName: objectName(tac || s.name, used), Latitude: Number(lat), Longitude: Number(lon), SymbolTable: tbl, SymbolID: sym,
      Comment: `${s.name}${here.length ? ` ${here.map(p => p.tactical_callsign || p.name).join('/')}` : ''} ${dep.name}`.slice(0, 43), IntervalMinutes: 30, Enabled: false, Path: '',
    })
  }
  if ((url.searchParams.get('format') || 'json') === 'csv') {
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const header = ['ObjectName', 'Latitude', 'Longitude', 'SymbolTable', 'SymbolID', 'Comment', 'IntervalMinutes', 'Enabled', 'Path']
    const csv = [header.join(','), ...rows.map(r => header.map(h => esc((r as Record<string, unknown>)[h])).join(','))].join('\n')
    return new Response(csv, { headers: { ...cors, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="aprs-objects-${dep.id.slice(0, 8)}.csv"` } })
  }
  return json({ deployment: { id: dep.id, name: dep.name }, objects: rows })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const route = url.pathname.replace(/^.*aprs-ingest\/?/, '').replace(/\/$/, '')
  const bridge = await authenticate(req, url)
  if (!bridge) return route === 'action' ? text('denied: bad token', 401) : json({ error: 'Unauthorized' }, 401)
  try {
    if (route === 'ping' && req.method === 'GET') return json({ ok: true, bridge: bridge.name, group: bridge.ares_group_id })
    if (route === 'stations' && req.method === 'POST') return json(await ingestStations(bridge, await req.json()))
    if (route === 'action' && req.method === 'POST') return text(await handleAction(bridge, await readActionBody(req)))
    if (route === 'action' && req.method === 'GET') return text(await handleAction(bridge, Object.fromEntries(url.searchParams)))
    if (route === 'outbox' && req.method === 'GET') return json(await listOutbox(bridge))
    if (route === 'outbox/ack' && req.method === 'POST') return json(await ackOutbox(bridge, await req.json()))
    if (route === 'objects' && req.method === 'GET') return objects(bridge, url)
    return json({ error: `unknown route ${req.method} ${route || '/'}` }, 404)
  } catch (err) {
    console.error('aprs-ingest', route, err)
    await admin.from('aprs_bridges').update({ last_error: String((err as Error).message).slice(0, 200) }).eq('id', bridge.id)
    return route === 'action' ? text('error, tell net control', 500) : json({ error: (err as Error).message }, 500)
  }
})
