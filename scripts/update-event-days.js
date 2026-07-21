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
  console.log('🔍 Fetching current events and event_days...')
  
  const { data: events } = await supabaseAdmin.from('events').select('*')
  console.log('Events in DB:', events)

  const { data: days } = await supabaseAdmin.from('event_days').select('*').order('day_number')
  console.log('Event Days in DB:', days)

  const conventionDates = [
    { day_number: 1, date: '2026-08-03' }, // Monday 3 Aug
    { day_number: 2, date: '2026-08-04' }, // Tuesday 4 Aug
    { day_number: 3, date: '2026-08-05' }, // Wednesday 5 Aug
    { day_number: 4, date: '2026-08-06' }, // Thursday 6 Aug
    { day_number: 5, date: '2026-08-07' }, // Friday 7 Aug
    { day_number: 6, date: '2026-08-08' }  // Saturday 8 Aug
  ]

  let eventId = events && events.length > 0 ? events[0].id : null

  if (!eventId) {
    console.log('🌱 Inserting default active event...')
    const { data: newEv, error: evErr } = await supabaseAdmin
      .from('events')
      .insert({
        name: 'RCCG DTCE 2026 Annual Convention',
        start_date: '2026-08-03',
        end_date: '2026-08-08',
        theme_colors: { primary: '#1B3A6B', secondary: '#C49A00' }
      })
      .select('id')
      .single()

    if (evErr) {
      console.error('Error inserting event:', evErr)
      process.exit(1)
    }
    eventId = newEv.id
  } else {
    // Update event start and end dates
    await supabaseAdmin
      .from('events')
      .update({
        name: 'RCCG DTCE 2026 Annual Convention',
        start_date: '2026-08-03',
        end_date: '2026-08-08'
      })
      .eq('id', eventId)
  }

  // Update existing event_days or insert missing ones
  for (const cd of conventionDates) {
    const existingDay = days?.find(d => d.day_number === cd.day_number)
    if (existingDay) {
      console.log(`📅 Updating Day ${cd.day_number} -> ${cd.date}...`)
      await supabaseAdmin
        .from('event_days')
        .update({ date: cd.date })
        .eq('id', existingDay.id)
    } else {
      console.log(`➕ Inserting Day ${cd.day_number} -> ${cd.date}...`)
      await supabaseAdmin
        .from('event_days')
        .insert({
          event_id: eventId,
          day_number: cd.day_number,
          date: cd.date
        })
    }
  }

  // Delete any extra days > 6 if present
  if (days && days.length > 6) {
    const extraDays = days.filter(d => d.day_number > 6)
    for (const ed of extraDays) {
      console.log(`🗑️ Deleting extra day ${ed.day_number}...`)
      await supabaseAdmin.from('event_days').delete().eq('id', ed.id)
    }
  }

  console.log('🎉 Event days updated to August 3 to August 8, 2026!')
}

main()
