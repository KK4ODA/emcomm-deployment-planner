import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify calling user is admin or operator
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
    if (!callerProfile || !['admin', 'operator'].includes(callerProfile.app_role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: jsonHeaders })
    }

    const { email, role, aresGroupIds } = await req.json()

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: jsonHeaders })
    }

    // Invite user via Supabase auth
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    if (inviteError) throw inviteError

    // Update the profile with role and ARES group
    if (inviteData?.user) {
      const updateData: Record<string, unknown> = {}
      if (role) updateData.app_role = role
      if (aresGroupIds) updateData.ares_group_ids = aresGroupIds

      if (Object.keys(updateData).length > 0) {
        await supabaseAdmin.from('users').update(updateData).eq('id', inviteData.user.id)
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Invitation sent to ${email}` }), {
      headers: jsonHeaders,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders })
  }
})
