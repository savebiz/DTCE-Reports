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
  console.log('🔍 Checking existing daily_reports in DB...')
  
  const { data: days } = await supabaseAdmin.from('event_days').select('*').order('day_number')
  console.log('Current Event Days:', days)

  const { data: reports } = await supabaseAdmin.from('daily_reports').select('*')
  console.log('Daily Reports count:', reports?.length)
  console.log('Daily Reports:', reports)

  const dayMap = {}
  days?.forEach(d => {
    dayMap[d.day_number] = d.id
  })

  // Update existing reports so event_day_id corresponds to valid new day_number
  if (reports && reports.length > 0) {
    for (const rep of reports) {
      // Check if event_day_id exists in current days
      const isValid = days?.some(d => d.id === rep.event_day_id)
      if (!isValid) {
        // Fallback to day 1 or map by position
        const targetDayId = dayMap[1]
        console.log(`📌 Updating report ${rep.id} to new Day 1 ID: ${targetDayId}...`)
        await supabaseAdmin
          .from('daily_reports')
          .update({ event_day_id: targetDayId })
          .eq('id', rep.id)
      }
    }
  }

  console.log('🎉 Daily reports relinked successfully!')
}

main()
