const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

async function makeRequest(pathStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
    const options = {
      hostname: url.hostname,
      path: pathStr,
      method: 'GET',
      headers: {
        'apikey': env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json'
      }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, data }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function test() {
  console.log('=== CHECKING PRE-EVENT ONLINE TOTALS IN DB ===\n')

  const preRes = await makeRequest('/rest/v1/registration_pre_event_totals?select=*')
  console.log('registration_pre_event_totals table rows:', preRes.data)

  const deptRes = await makeRequest('/rest/v1/departments?name=ilike.*Registration*&select=id,name,default_metrics_schema')
  console.log('Registration department schema:', deptRes.data)
}

test().catch(console.error)
