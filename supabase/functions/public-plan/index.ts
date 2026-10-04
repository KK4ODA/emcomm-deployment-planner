// public-plan
//
// The read-only view of a deployment behind a share link. Partner agencies,
// venues and anyone without an account get the times, the sites with
// addresses and arrival notes, and the units; contact details only when the
// planner opted in when minting the link.
//
//   GET /public-plan?t=<token>
//
// The token is never stored, only its SHA-256, and the anonymous role never
// touches the deployment tables: this function holds the service role and
// calls one SECURITY DEFINER function that decides what a link may show.
// verify_jwt is off, which is the point.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
  const url = new URL(req.url)
  const token = (url.searchParams.get('t') || '').trim()
  // Tokens are 'eds_' plus 48 hex characters; reject anything else before touching the database.
  if (!/^eds_[0-9a-f]{48}$/.test(token)) return json({ error: 'not_found' }, 404)
  try {
    const { data, error } = await admin.rpc('public_deployment_view', { p_token_hash: await sha256(token) })
    if (error) throw error
    const body = data as Record<string, unknown>
    if (!body || body.error) return json({ error: 'not_found' }, 404)
    return json(body)
  } catch (err) {
    console.error('public-plan', err)
    return json({ error: (err as Error).message }, 500)
  }
})
