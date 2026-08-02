import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!

const supabase = createClient(supabaseUrl, serviceKey)

async function check() {
  // 1. Get active event
  const { data: events, error: eventErr } = await supabase.from('events').select('*')
  console.log('Events:', events)

  // 2. Get Registration department ID
  const { data: depts, error: deptErr } = await supabase.from('departments').select('id, name, default_metrics_schema').ilike('name', '%registration%')
  console.log('Registration Depts:', depts)

  if (!depts || depts.length === 0) {
    console.log('No registration department found. Checking all depts...')
    const { data: allDepts } = await supabase.from('departments').select('id, name')
    console.log('All depts:', allDepts)
    return
  }

  const regDept = depts[0]

  // 3. Query daily_reports for Registration department
  const { data: reports, error: reportsErr } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('department_id', regDept.id)

  console.log(`Daily reports for ${regDept.name} (${regDept.id}):`, reports)
  console.log(`Count of reports: ${reports?.length || 0}`)
}

check().catch(console.error)
