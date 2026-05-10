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
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
    }

    const { lat, lng } = await req.json()
    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: 'Missing lat or lng' }), { status: 400, headers: jsonHeaders })
    }

    const apiKey = Deno.env.get('WHAT3WORDS_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: jsonHeaders })
    }

    const response = await fetch(
      `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&key=${apiKey}`
    )

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch what3words' }), { status: response.status, headers: jsonHeaders })
    }

    const data = await response.json()

    return new Response(JSON.stringify({
      words: data.words,
      nearestPlace: data.nearestPlace,
      map: data.map
    }), { headers: jsonHeaders })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders })
  }
})
