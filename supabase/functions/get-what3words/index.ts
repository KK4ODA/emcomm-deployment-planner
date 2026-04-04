import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const { lat, lng } = await req.json()
    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: 'Missing lat or lng' }), { status: 400 })
    }

    const apiKey = Deno.env.get('WHAT3WORDS_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 })
    }

    const response = await fetch(
      `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&key=${apiKey}`
    )

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch what3words' }), { status: response.status })
    }

    const data = await response.json()

    return new Response(JSON.stringify({
      words: data.words,
      nearestPlace: data.nearestPlace,
      map: data.map
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
