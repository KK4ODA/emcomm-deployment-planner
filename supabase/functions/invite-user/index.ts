import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Invite a member by email. Callable by admins and planners.
// Admins may set any initial role; planners may only invite as pending,
// viewer or operator. Group membership is written to `memberships` (active),
// never to users.ares_group_ids, which is a server-maintained mirror.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

const ROLES = ['admin', 'planner', 'operator', 'viewer', 'pending']
const PLANNER_MAY_GRANT = ['operator', 'viewer', 'pending']

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

    const { email, role, aresGroupIds } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: jsonHeaders })
    }
    if (role && !ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Unknown role' }), { status: 400, headers: jsonHeaders })
    }
    if (role && callerRole === 'planner' && !PLANNER_MAY_GRANT.includes(role)) {
      return new Response(JSON.stringify({ error: 'Planners may invite as pending, viewer or operator only' }), { status: 403, headers: jsonHeaders })
    }

    // Planners can only add people to groups they belong to
    let groupIds: string[] = Array.isArray(aresGroupIds) ? aresGroupIds : []
    if (callerRole === 'planner' && groupIds.length) {
      const { data: mine } = await supabaseAdmin.from('memberships').select('ares_group_id').eq('user_id', user.id).eq('status', 'active')
      const allowed = new Set((mine ?? []).map((m: { ares_group_id: string }) => m.ares_group_id))
      groupIds = groupIds.filter((id) => allowed.has(id))
    }

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    if (inviteError) throw inviteError

    if (inviteData?.user) {
      const newId = inviteData.user.id
      if (role) {
        await supabaseAdmin.from('users').update({ app_role: role }).eq('id', newId)
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

    return new Response(JSON.stringify({ success: true, message: `Invitation sent to ${email}` }), {
      headers: jsonHeaders,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders })
  }
})
