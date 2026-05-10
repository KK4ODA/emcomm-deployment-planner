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

    // Verify calling user is admin
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

    // Check caller is admin
    const { data: callerProfile } = await supabaseAdmin.from('users').select('app_role').eq('id', user.id).single()
    if (callerProfile?.app_role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: jsonHeaders })
    }

    const { email, full_name, call_sign, phone, aprs_call_sign } = await req.json()

    if (!email || !full_name || !call_sign || !phone) {
      return new Response(JSON.stringify({ error: 'Email, full name, call sign, and phone are required' }), { status: 400, headers: jsonHeaders })
    }

    // Check if user exists
    const { data: existingUsers } = await supabaseAdmin.from('users').select('*').eq('email', email)

    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0]
      await supabaseAdmin.from('users').update({
        full_name,
        call_sign: call_sign || existingUser.call_sign,
        phone: phone || existingUser.phone,
        aprs_call_sign: aprs_call_sign || existingUser.aprs_call_sign
      }).eq('id', existingUser.id)

      return new Response(JSON.stringify({ success: true, message: `Profile updated for ${email}` }), {
        headers: jsonHeaders,
      })
    } else {
      // Invite user via Supabase auth
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
      if (inviteError) throw inviteError

      // Update the newly created profile
      if (inviteData?.user) {
        await supabaseAdmin.from('users').update({
          full_name,
          call_sign,
          phone,
          aprs_call_sign
        }).eq('id', inviteData.user.id)
      }

      return new Response(JSON.stringify({ success: true, message: `Invitation sent and profile created for ${email}` }), {
        headers: jsonHeaders,
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders })
  }
})
