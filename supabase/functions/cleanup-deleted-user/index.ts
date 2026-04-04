import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const { event, old_data } = await req.json()

    if (event?.type !== 'delete' || !old_data?.call_sign) {
      return new Response(JSON.stringify({ message: 'No action needed' }))
    }

    const callSign = old_data.call_sign

    // 1. Clean up deployment_items assigned_to arrays
    const { data: items } = await supabaseAdmin.from('deployment_items').select('id, assigned_to')
    for (const item of (items || [])) {
      if (item.assigned_to && Array.isArray(item.assigned_to)) {
        const updated = item.assigned_to.filter((cs: string) => cs !== callSign)
        if (updated.length !== item.assigned_to.length) {
          await supabaseAdmin.from('deployment_items').update({ assigned_to: updated }).eq('id', item.id)
        }
      }
    }

    // 2. Clean up deployment_locations assigned_call_signs arrays
    const { data: locations } = await supabaseAdmin.from('deployment_locations').select('id, assigned_call_signs')
    for (const location of (locations || [])) {
      if (location.assigned_call_signs && Array.isArray(location.assigned_call_signs)) {
        const updated = location.assigned_call_signs.filter((cs: string) => cs !== callSign)
        if (updated.length !== location.assigned_call_signs.length) {
          await supabaseAdmin.from('deployment_locations').update({ assigned_call_signs: updated }).eq('id', location.id)
        }
      }
    }

    // 3. Clean up tasks assigned_to_call_sign
    await supabaseAdmin
      .from('tasks')
      .update({ assigned_to_call_sign: null })
      .eq('assigned_to_call_sign', callSign)

    return new Response(JSON.stringify({ message: 'User references cleaned up', callSign }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
