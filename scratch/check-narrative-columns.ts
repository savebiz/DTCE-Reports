import { createClient } from 'npm:@supabase/supabase-js'
import * as dotenv from 'npm:dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log('Querying first department_narratives row to check columns...')
  const { data, error } = await supabase
    .from('department_narratives')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('Error fetching narrative:', error)
    return
  }
  console.log('Returned row data:', data)
}

check()
