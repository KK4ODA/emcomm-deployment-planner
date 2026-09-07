import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Invite a member by email, or add an existing member to groups.
// Callable by admins and planners. Admins may set any initial role; planners
// may only invite as pending, viewer or operator. Group membership is written
// to `memberships` (active), never to users.ares_group_ids, which is a
// server-maintained mirror. Optional profile fields (call sign, name, phone,
// licence class) are filled in when the row has none, so a roster import can
// pre-populate profiles without overwriting what people typed themselves.
//
// v3: profile fields; existing users are joined to the groups instead of
// failing; `sendEmail: false` skips the invitation email (dry-run / re-add).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

const ROLES = ['admin', 'planner', 'operator', 'viewer', 'pending']
const PLANNER_MAY_GRANT = ['operator', 'viewer', 'pending']
const LICENSE_CLASSES = ['novice', 'technician', 'general', 'advanced', 'extra']
const CALLSIGN = /^[A-Z]{1,2}\d[A-Z]{1,3}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization')
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
    }

    const { data: callerProfile } = await supabaseAdmin.from('users').select('app_role').eq('id', user.id).single()
    const callerRole = callerProfile?.app_role
    if (!callerRole || !['admin', 'planner'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: jsonHeaders })
    }

    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const { role, aresGroupIds } = body
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400, headers: jsonHeaders })
    }
    if (role && !ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Unknown role' }), { status: 400, headers: jsonHeaders })
    }
    if (role && callerRole === 'planner' && !PLANNER_MAY_GRANT.includes(role)) {
      return new Response(JSON.stringify({ error: 'Planners may invite as pending, viewer or operator only' }), { status: 403, headers: jsonHeaders })
    }

    // Optional profile fields, validated and normalised.
    const profile: Record<string, string> = {}
    const callSign = String(body.call_sign ?? '').trim().toUpperCase()
    if (callSign) {
      if (!CALLSIGN.test(callSign)) return new Response(JSON.stringify({ error: `Call sign ${callSign} is not valid` }), { status: 400, headers: jsonHeaders })
      profile.call_sign = callSign
    }
    if (body.full_name) profile.full_name = String(body.full_name).trim().slice(0, 120)
    if (body.phone) profile.phone = String(body.phone).trim().slice(0, 40)
    if (body.license_class) {
      const lc = String(body.license_class).trim().toLowerCase()
      if (!LICENSE_CLASSES.includes(lc)) return new Response(JSON.stringify({ error: `Licence class ${body.license_class} is not valid` }), { status: 400, headers: jsonHeaders })
      profile.license_class = lc
    }

    // Planners can only add people to groups they belong to
    let groupIds: string[] = Array.isArray(aresGroupIds) ? aresGroupIds : []
    if (callerRole === 'planner' && groupIds.length) {
      const { data: mine } = await supabaseAdmin.from('memberships').select('ares_group_id').eq('user_id', user.id).eq('status', 'active')
      const allowed = new Set((mine ?? []).map((m: { ares_group_id: string }) => m.ares_group_id))
      groupIds = groupIds.filter((id) => allowed.has(id))
    }

    // Existing member: join groups and fill empty profile fields; never change their role.
    const { data: existing } = await supabaseAdmin.from('users').select('id, call_sign, full_name, phone, license_class').eq('email', email).maybeSingle()
    if (existing) {
      const fill: Record<string, string> = {}
      for (const [k, v] of Object.entries(profile)) if (!existing[k as keyof typeof existing]) fill[k] = v
      if (Object.keys(fill).length) {
        const { error: fillError } = await supabaseAdmin.from('users').update(fill).eq('id', existing.id)
        if (fillError && fillError.code !== '23505') throw fillError
      }
      if (groupIds.length) {
        await supabaseAdmin.from('memberships').upsert(
          groupIds.map((ares_group_id) => ({
            ares_group_id, user_id: existing.id, status: 'active', approved_at: new Date().toISOString(), approved_by: user.id,
          })),
          { onConflict: 'ares_group_id,user_id' },
        )
      }
      return new Response(JSON.stringify({ success: true, existing: true, message: `${email} is already a member; added to ${groupIds.length} group${groupIds.length === 1 ? '' : 's'}` }), { headers: jsonHeaders })
    }

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    if (inviteError) throw inviteError

    if (inviteData?.user) {
      const newId = inviteData.user.id
      const update: Record<string, string> = { ...profile }
      if (role) update.app_role = role
      if (Object.keys(update).length) {
        const { error: updError } = await supabaseAdmin.from('users').update(update).eq('id', newId)
        if (updError) {
          // A duplicate call sign must not lose the invitation; drop it and keep the rest.
          if (updError.code === '23505' && update.call_sign) {
            delete update.call_sign
            await supabaseAdmin.from('users').update(update).eq('id', newId)
          } else {
            throw updError
          }
        }
      }
      if (groupIds.length) {
        await supabaseAdmin.from('memberships').upsert(
          groupIds.map((ares_group_id) => ({
            ares_group_id, user_id: newId, status: 'active', approved_at: new Date().toISOString(), approved_by: user.id,
          })),
          { onConflict: 'ares_group_id,user_id' },
        )
      }
    }

    return new Response(JSON.stringify({ success: true, existing: false, message: `Invitation sent to ${email}` }), {
      headers: jsonHeaders,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: jsonHeaders })
  }
})
