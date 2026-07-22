import * as dotenv from 'npm:dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

async function check() {
  console.log('Fetching PostgREST OpenAPI spec...')
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  })
  console.log('Status:', res.status)
  const spec = await res.json()
  if (spec.definitions) {
    console.log('Definitions found! keys:', Object.keys(spec.definitions))
    const tableDef = spec.definitions?.department_narratives
    if (tableDef) {
      console.log('department_narratives properties:', Object.keys(tableDef.properties))
    }
  } else {
    console.log('Response body:', spec)
  }
}

check()
