import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const { deploymentId, format = 'txt', includeGoKit = true } = await req.json()

    if (!deploymentId) {
      return new Response(JSON.stringify({ error: 'Deployment ID required' }), { status: 400 })
    }

    // Fetch all data
    const { data: deployments } = await supabaseAdmin.from('deployments').select('*').eq('id', deploymentId)
    const deployment = deployments?.[0]
    if (!deployment) {
      return new Response(JSON.stringify({ error: 'Deployment not found' }), { status: 404 })
    }

    const { data: locations } = await supabaseAdmin.from('deployment_locations').select('*').eq('deployment_id', deploymentId).order('sort_order')
    const { data: allItems } = await supabaseAdmin.from('deployment_items').select('*')
    const { data: allTasks } = await supabaseAdmin.from('tasks').select('*')
    const { data: categories } = await supabaseAdmin.from('categories').select('*').eq('deployment_id', deploymentId)
    const { data: users } = await supabaseAdmin.from('users').select('*')
    const { data: allIcs205Forms } = await supabaseAdmin.from('ics205_forms').select('*')

    // Fetch what3words for locations with coordinates
    const parseCoordinates = (address: string) => {
      if (!address) return null
      const coordRegex = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/
      const match = address.match(coordRegex)
      if (match) {
        const lat = parseFloat(match[1])
        const lon = parseFloat(match[2])
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          return [lat, lon]
        }
      }
      return null
    }

    const what3wordsMap: Record<string, string> = {}
    const apiKey = Deno.env.get('WHAT3WORDS_API_KEY')
    if (apiKey) {
      for (const location of (locations || [])) {
        const coords = parseCoordinates(location.address)
        if (coords) {
          try {
            const w3wResponse = await fetch(
              `https://api.what3words.com/v3/convert-to-3wa?coordinates=${coords[0]},${coords[1]}&key=${apiKey}`
            )
            if (w3wResponse.ok) {
              const w3wData = await w3wResponse.json()
              what3wordsMap[location.id] = w3wData.words
            }
          } catch (_) { /* skip */ }
        }
      }
    }

    // Build the text output
    const now = new Date()
    const localTimeStr = now.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short'
    })

    let output = ''
    output += '='.repeat(80) + '\n'
    output += `DEPLOYMENT EXPORT: ${deployment.name}\n`
    output += '='.repeat(80) + '\n'
    output += `Exported: ${localTimeStr}\n`
    output += `Status: ${deployment.status}\n`
    if (deployment.location) output += `Location: ${deployment.location}\n`
    if (deployment.description) output += `Description: ${deployment.description}\n`
    if (deployment.start_date) output += `Start Date: ${deployment.start_date}\n`
    if (deployment.end_date) output += `End Date: ${deployment.end_date}\n`

    // Collect all call signs
    const allCallSigns = new Set<string>()
    for (const location of (locations || [])) {
      if (location.assigned_call_signs) {
        location.assigned_call_signs.forEach((cs: string) => allCallSigns.add(cs))
      }
    }
    for (const item of (allItems || [])) {
      if (item.assigned_to) {
        if (Array.isArray(item.assigned_to)) {
          item.assigned_to.forEach((cs: string) => allCallSigns.add(cs))
        } else {
          allCallSigns.add(item.assigned_to)
        }
      }
    }
    if (allCallSigns.size > 0) {
      output += `Call Signs: ${Array.from(allCallSigns).sort().join(',')}\n`
    }
    output += '\n'
    output += '-'.repeat(80) + '\n'
    output += 'CHECK YOUR WINLINK MESSAGES OFTEN, VIA VHF, HF OR TELNET (PREFERRED)\n'
    output += '-'.repeat(80) + '\n\n'

    // Process each location
    for (const location of (locations || [])) {
      output += '='.repeat(80) + '\n'
      output += `LOCATION: ${location.name}\n`
      output += '='.repeat(80) + '\n'
      if (location.description) output += `Description: ${location.description}\n`
      if (location.address) output += `Address: ${location.address}\n`
      if (what3wordsMap[location.id]) output += `What3Words: ///${what3wordsMap[location.id]}\n`
      if (location.contact_person) output += `Contact: ${location.contact_person}\n`
      if (location.assigned_call_signs?.length > 0) {
        output += `Assigned Call Signs: ${location.assigned_call_signs.join(',')}\n`
      }
      output += '\n'

      // ICS 205
      const ics205 = (allIcs205Forms || []).find((f: any) => f.deployment_location_id === location.id)
      if (ics205) {
        output += '-'.repeat(80) + '\n'
        output += `ICS 205 RADIO COMMUNICATIONS PLAN - ${location.name}\n`
        output += '-'.repeat(80) + '\n'
        if (ics205.incident_name) output += `Incident: ${ics205.incident_name}\n`
        if (ics205.radio_channels?.length > 0) {
          output += '\nRADIO CHANNELS:\n'
          for (const ch of ics205.radio_channels) {
            if (ch.channel_name || ch.channel_number) {
              output += `  ${ch.channel_name || 'Channel'}`
              if (ch.channel_number) output += ` (#${ch.channel_number})`
              output += '\n'
              if (ch.rx_freq || ch.tx_freq) {
                output += `    `
                if (ch.rx_freq) output += `RX: ${ch.rx_freq}`
                if (ch.rx_tone) output += `/${ch.rx_tone}`
                if (ch.tx_freq) output += `, TX: ${ch.tx_freq}`
                if (ch.tx_tone) output += `/${ch.tx_tone}`
                if (ch.mode) output += `, Mode: ${ch.mode}`
                output += '\n'
              }
              if (ch.remarks) output += `    Remarks: ${ch.remarks}\n`
            }
          }
        }
        if (ics205.special_instructions) output += `\nSpecial Instructions: ${ics205.special_instructions}\n`
        output += '\n'
      }

      // Tasks
      const locationTasks = (allTasks || []).filter((t: any) => t.deployment_location_id === location.id)
      if (locationTasks.length > 0) {
        output += '-'.repeat(80) + '\n'
        output += 'SETUP TASKS\n'
        output += '-'.repeat(80) + '\n'
        for (const task of locationTasks) {
          output += `  [${task.status.toUpperCase()}] ${task.name}`
          if (task.assigned_to_call_sign) output += ` - ${task.assigned_to_call_sign}`
          output += '\n'
        }
        output += '\n'
      }

      // Items
      const locationItems = (allItems || []).filter((i: any) => i.deployment_location_id === location.id)
      if (locationItems.length === 0) continue

      const itemsByCallSign: Record<string, any[]> = {}
      const unassignedItems: any[] = []

      for (const item of locationItems) {
        if (item.assigned_to?.length > 0) {
          const callSigns = Array.isArray(item.assigned_to) ? item.assigned_to : [item.assigned_to]
          for (const cs of callSigns) {
            if (!itemsByCallSign[cs]) itemsByCallSign[cs] = []
            itemsByCallSign[cs].push(item)
          }
        } else {
          unassignedItems.push(item)
        }
      }

      if (Object.keys(itemsByCallSign).length > 0 || unassignedItems.length > 0) {
        output += '-'.repeat(80) + '\n'
        output += 'EQUIPMENT/ITEMS\n'
        output += '-'.repeat(80) + '\n'
      }

      for (const callSign of Object.keys(itemsByCallSign).sort()) {
        const userInfo = (users || []).find((u: any) => u.call_sign === callSign)
        output += `\n${callSign}`
        if (userInfo?.aprs_call_sign) output += ` (APRS: ${userInfo.aprs_call_sign})`
        output += ':\n'
        for (const item of itemsByCallSign[callSign].sort((a: any, b: any) => a.name.localeCompare(b.name))) {
          const category = (categories || []).find((c: any) => c.id === item.category_id)
          output += `  ${item.name}`
          if (item.quantity > 1) output += ` (x${item.quantity})`
          if (category) output += ` [${category.name}]`
          if (item.priority) output += ` - ${item.priority.toUpperCase()}`
          output += '\n'
        }
      }

      if (unassignedItems.length > 0) {
        output += `\nUNASSIGNED ITEMS:\n`
        for (const item of unassignedItems.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
          output += `  ${item.name}`
          if (item.quantity > 1) output += ` (x${item.quantity})`
          output += '\n'
        }
      }
      output += '\n'
    }

    // Go-Kit
    if (includeGoKit) {
      output += '='.repeat(80) + '\n'
      output += 'PERSONAL GO KIT CHECKLIST\n'
      output += '='.repeat(80) + '\n'
      const goKitItems = [
        'Battery pack for phone', 'Cables for digital interface', 'Charger for HTs',
        'Coax', 'Coax adapters', 'Digirig/AIOC/Signalink', 'First aid kit',
        'High Vis vest', 'HT earpiece', 'HT speakermic', 'Laptop charger with car adapter',
        'Laptop with Ham software', 'Lightweight mast', 'Main HT transceiver',
        'Multitool', 'Paper/Pen', 'Portable VHF/UHF antenna', 'Rain jacket/pants',
        'Spare HT batteries', 'Spare HT transceiver', 'Sturdy shoes', 'Sun hat',
        'Sunscreen', 'Toilet paper', 'Warm clothes', 'Water, snacks, medicines'
      ]
      for (const item of goKitItems) output += `  ${item}\n`
      output += '\n'
    }

    output += '='.repeat(80) + '\n'
    output += 'END OF DEPLOYMENT EXPORT\n'
    output += '='.repeat(80) + '\n'

    // Return as text
    const safeName = deployment.name.replace(/[^a-z0-9]/gi, '_')
    return new Response(output, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${safeName}_export.txt"`
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
