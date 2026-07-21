const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Env parsing
const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      process.env[key] = value
    }
  })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(url, key)

async function main() {
  console.log('🔍 Resolving Accommodation Department UUID...')
  const { data: dept } = await supabaseAdmin
    .from('departments')
    .select('id, name')
    .ilike('name', 'Accommodation')
    .single()

  if (!dept) {
    console.error('❌ Could not find Accommodation department in database')
    process.exit(1)
  }

  console.log(`✅ Accommodation UUID: ${dept.id}`)

  // Find user emmanuel.owojori
  const { data: userProf } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('username', 'emmanuel.owojori')
    .maybeSingle()

  if (!userProf) {
    console.error('❌ Could not find profile for emmanuel.owojori')
    process.exit(1)
  }

  console.log(`👤 Found user emmanuel.owojori (ID: ${userProf.id}). Updating department_id...`)

  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({ department_id: dept.id, role: 'assistant' })
    .eq('id', userProf.id)

  if (updateErr) {
    console.error('❌ Failed to update profile:', updateErr.message)
  } else {
    console.log('✅ Successfully updated profiles department_id')
  }

  // Fetch active event id
  const { data: eventsList } = await supabaseAdmin.from('events').select('id').limit(1)
  const eventId = eventsList && eventsList.length > 0 ? eventsList[0].id : null

  if (eventId) {
    console.log(`📌 Upserting hod_assignments for event ${eventId}...`)
    const { error: assErr } = await supabaseAdmin
      .from('hod_assignments')
      .upsert({
        event_id: eventId,
        profile_id: userProf.id,
        department_id: dept.id,
        role_in_event: 'assistant'
      }, { onConflict: 'event_id,profile_id,department_id' })

    if (assErr) {
      console.error('⚠️ hod_assignments insert error:', assErr.message)
    } else {
      console.log('✅ Successfully added hod_assignment row!')
    }
  }

  console.log('🎉 Fix complete!')
}

main()
