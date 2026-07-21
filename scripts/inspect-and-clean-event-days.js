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
  console.log('🔍 Inspecting all Events and Event Days in Supabase...')

  const { data: events } = await supabaseAdmin.from('events').select('*')
  console.log('Events count:', events?.length)
  console.log('Events:', events)

  const { data: days } = await supabaseAdmin.from('event_days').select('*').order('day_number')
  console.log('Event Days count:', days?.length)
  console.log('Event Days:', days)

  // 1. Pick or create primary active event
  let primaryEvent = events?.find(e => e.name.includes('Convention') || e.name.includes('Annual'))
  if (!primaryEvent && events && events.length > 0) {
    primaryEvent = events[0]
  }

  if (!primaryEvent) {
    const { data: newEv } = await supabaseAdmin
      .from('events')
      .insert({
        name: 'RCCG DTCE 2026 Annual Convention',
        start_date: '2026-08-03',
        end_date: '2026-08-08',
        theme_colors: { primary: '#1B3A6B', secondary: '#C49A00' }
      })
      .select()
      .single()
    primaryEvent = newEv
  } else {
    await supabaseAdmin
      .from('events')
      .update({
        name: 'RCCG DTCE 2026 Annual Convention',
        start_date: '2026-08-03',
        end_date: '2026-08-08'
      })
      .eq('id', primaryEvent.id)
  }

  console.log('🎯 Primary Event ID:', primaryEvent.id)

  // 2. Delete ALL existing event_days to start completely clean
  console.log('🧹 Clearing all existing event_days rows...')
  await supabaseAdmin.from('event_days').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // 3. Delete secondary events to avoid leftover references
  if (events && events.length > 1) {
    for (const ev of events) {
      if (ev.id !== primaryEvent.id) {
        console.log(`🗑️ Deleting secondary event ${ev.name} (${ev.id})...`)
        await supabaseAdmin.from('events').delete().eq('id', ev.id)
      }
    }
  }

  // 4. Insert exact 6 Convention Days: August 3 to August 8, 2026
  const canonicalDays = [
    { day_number: 1, date: '2026-08-03' }, // Monday 3 Aug
    { day_number: 2, date: '2026-08-04' }, // Tuesday 4 Aug
    { day_number: 3, date: '2026-08-05' }, // Wednesday 5 Aug
    { day_number: 4, date: '2026-08-06' }, // Thursday 6 Aug
    { day_number: 5, date: '2026-08-07' }, // Friday 7 Aug
    { day_number: 6, date: '2026-08-08' }  // Saturday 8 Aug
  ]

  console.log('✨ Inserting 6 clean Convention Days (Aug 3 - Aug 8)...')
  for (const cd of canonicalDays) {
    const { data: newDay, error: dayErr } = await supabaseAdmin
      .from('event_days')
      .insert({
        event_id: primaryEvent.id,
        day_number: cd.day_number,
        date: cd.date
      })
      .select()
      .single()

    if (dayErr) {
      console.error(`❌ Failed to insert Day ${cd.day_number}:`, dayErr.message)
    } else {
      console.log(`✅ Inserted Day ${cd.day_number} (${cd.date}) -> ID: ${newDay.id}`)
    }
  }

  // 5. Update any existing daily_reports event_id to primaryEvent.id
  await supabaseAdmin
    .from('daily_reports')
    .update({ event_id: primaryEvent.id })
    .neq('event_id', primaryEvent.id)

  console.log('🎉 Database cleaned and updated to exact August 3 to August 8, 2026 schedule!')
}

main()
