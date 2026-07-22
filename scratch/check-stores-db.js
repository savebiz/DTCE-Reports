const fs = require('fs')

const envText = fs.readFileSync('.env.local', 'utf-8')
const envVars = {}
envText.split('\n').forEach(line => {
  const parts = line.split('=')
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim()
  }
})

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'] || ''
const serviceKey = envVars['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE'] || envVars['SUPABASE_SERVICE_ROLE_KEY'] || envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || ''

async function query(table, select = '*') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  })
  return await res.json()
}

async function run() {
  console.log('--- PROFILES ---')
  console.log(JSON.stringify(await query('profiles', 'id,email,username,role,department_id,full_name'), null, 2))

  console.log('--- DEPTS ---')
  console.log(JSON.stringify(await query('departments', 'id,name'), null, 2))

  console.log('--- HOD ASSIGNMENTS ---')
  console.log(JSON.stringify(await query('hod_assignments', '*'), null, 2))

  console.log('--- STORE REQUESTS ---')
  console.log(JSON.stringify(await query('store_requests', '*'), null, 2))
}

run()
