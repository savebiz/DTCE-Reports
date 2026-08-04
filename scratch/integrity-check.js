const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

async function makeRequest(pathStr, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
    const options = {
      hostname: url.hostname,
      path: pathStr,
      method,
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
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function runCheck() {
  console.log('=== SECTION 0: DATA INTEGRITY CHECK ===')

  // 1. Check if registration_pre_event_totals exists in schema
  console.log('\n--- 1. Checking table registration_pre_event_totals existence ---')
  const preTotalsRes = await makeRequest('/rest/v1/registration_pre_event_totals?select=*&limit=1')
  console.log('registration_pre_event_totals query status:', preTotalsRes.status)
  console.log('registration_pre_event_totals query body:', preTotalsRes.data.slice(0, 300))

  // Check OpenAPI definitions
  const openApiRes = await makeRequest('/rest/v1/')
  let hasPreTotalsInOpenApi = false
  try {
    const spec = JSON.parse(openApiRes.data)
    hasPreTotalsInOpenApi = !!spec.definitions?.registration_pre_event_totals
    console.log('OpenAPI definitions include registration_pre_event_totals:', hasPreTotalsInOpenApi)
  } catch (e) {
    console.log('Failed to parse OpenAPI spec:', e.message)
  }

  // 2. Check Registration department default_metrics_schema
  console.log('\n--- 2. Checking Registration department schema ---')
  const regDeptRes = await makeRequest('/rest/v1/departments?name=ilike.*registration*&select=id,name,default_metrics_schema')
  console.log('Registration dept status:', regDeptRes.status)
  console.log('Registration dept body:', regDeptRes.data)

  // 3. Check daily_reports production data integrity across all departments
  console.log('\n--- 3. Checking daily_reports production data integrity ---')
  const reportsRes = await makeRequest('/rest/v1/daily_reports?select=id,event_id,department_id,status,metrics_data,created_at&limit=50')
  console.log('daily_reports query status:', reportsRes.status)
  try {
    const reports = JSON.parse(reportsRes.data)
    console.log('Total daily_reports rows in DB:', reports.length)
    if (reports.length > 0) {
      console.log('Sample row statuses & departments:', reports.slice(0, 5).map(r => ({
        id: r.id,
        dept: r.department_id,
        status: r.status,
        metricsKeys: Object.keys(r.metrics_data || {})
      })))
    }
  } catch (e) {
    console.log('Failed to parse daily_reports:', reportsRes.data)
  }

  // 4. Check department_narratives
  console.log('\n--- 4. Checking department_narratives production data ---')
  const narrativesRes = await makeRequest('/rest/v1/department_narratives?select=id,department_id,status,created_at&limit=10')
  console.log('department_narratives query status:', narrativesRes.status)
  try {
    const narratives = JSON.parse(narrativesRes.data)
    console.log('Total department_narratives rows:', narratives.length)
  } catch (e) {
    console.log('Failed to parse department_narratives:', narrativesRes.data)
  }
}

runCheck().catch(console.error)
