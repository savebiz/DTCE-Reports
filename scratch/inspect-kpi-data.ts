import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectKpis() {
  const { data: days } = await supabase.from('event_days').select('*').order('day_number')
  console.log('EVENT DAYS:', days)

  const { data: depts } = await supabase.from('departments').select('*')
  console.log('DEPTS COUNT:', depts?.length)

  const { data: reports } = await supabase.from('daily_reports').select('*')
  console.log('DAILY REPORTS:', reports)
}

inspectKpis()
