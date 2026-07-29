import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function checkPolicies() {
  if (!serviceKey) {
    console.log('No service key provided, skipping live policy check.')
    return
  }
  const adminSupabase = createClient(supabaseUrl, serviceKey)
  
  const { data: policies, error } = await adminSupabase
    .rpc('get_policies_for_table', { table_name: 'inventory_items' })
    .catch(() => ({ data: null, error: null }))

  console.log('Policies result:', { policies, error })
}

checkPolicies()
