import * as dotenv from 'npm:dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from 'npm:@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data } = await supabase.from('departments').select('id, name')
  console.log('DEPARTMENTS IN DB:')
  console.log(JSON.stringify(data, null, 2))
}

run()
