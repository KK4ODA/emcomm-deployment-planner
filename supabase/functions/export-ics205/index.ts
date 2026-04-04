import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Note: jsPDF is not easily importable in Deno Edge Functions.
// This function returns structured JSON data that the frontend can use
// with its existing client-side jsPDF to generate the PDF.
// Alternatively, deploy this with jsPDF when Supabase supports npm imports.

Deno.serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify auth
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

    const { formId } = await req.json()

    // Fetch the ICS 205 form
    const { data: forms } = await supabaseAdmin.from('ics205_forms').select('*').eq('id', formId)
    const form = forms?.[0]
    if (!form) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 })
    }

    // Fetch location name
    const { data: locations } = await supabaseAdmin.from('deployment_locations').select('name').eq('id', form.deployment_location_id)
    const locationName = locations?.[0]?.name || 'Unknown'

    // Return the form data for client-side PDF generation
    return new Response(JSON.stringify({
      form,
      locationName
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
