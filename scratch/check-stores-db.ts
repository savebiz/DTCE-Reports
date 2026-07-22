import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const envText = fs.readFileSync('.env.local', 'utf-8')
const envVars: Record<string, string> = {}
envText.split('\n').forEach(line => {
  const parts = line.split('=')
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim()
  }
})

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'] || ''
const serviceKey = envVars['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE'] || envVars['SUPABASE_SERVICE_ROLE_KEY'] || ''

const supabase = createClient(supabaseUrl, serviceKey)

async function run() {
  const { data: profs } = await supabase.from('profiles').select('id, email, username, role, department_id, full_name')
  console.log('--- PROFILES ---')
  console.log(JSON.stringify(profs, null, 2))

  const { data: depts } = await supabase.from('departments').select('id, name')
  console.log('--- DEPTS ---')
  console.log(JSON.stringify(depts, null, 2))

  const { data: assign } = await supabase.from('hod_assignments').select('*')
  console.log('--- HOD ASSIGNMENTS ---')
  console.log(JSON.stringify(assign, null, 2))

  const { data: reqs } = await supabase.from('store_requests').select('*')
  console.log('--- STORE REQUESTS ---')
  console.log(JSON.stringify(reqs, null, 2))
}

run()
