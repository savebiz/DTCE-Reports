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

async function runDiagnosis() {
  console.log('=== SECTION 0: REGISTRATION INSIGHT DIAGNOSIS ===\n')

  // 1. Get active event & event days
  console.log('--- 1. Fetching active event and event days ---')
  const eventsRes = await makeRequest('/rest/v1/events?select=*&order=created_at.desc&limit=5')
  const events = JSON.parse(eventsRes.data)
  console.log('Events:', events)

  const activeEvent = Array.isArray(events) ? (events.find(e => e.status === 'active') || events[0]) : null
  console.log('\nActive Event ID:', activeEvent?.id, activeEvent?.name)

  const eventDaysRes = await makeRequest(`/rest/v1/event_days?event_id=eq.${activeEvent.id}&select=id,day_number,date,status&order=day_number.asc`)
  const eventDays = JSON.parse(eventDaysRes.data)
  console.log('Event Days:', eventDays)

  // 2. Fetch Registration department ID
  console.log('\n--- 2. Fetching Registration Department ID ---')
  const regDeptRes = await makeRequest('/rest/v1/departments?name=ilike.*registration*&select=id,name,default_metrics_schema')
  const regDepts = JSON.parse(regDeptRes.data)
  const regDept = regDepts[0]
  console.log('Registration Dept:', regDept?.id, regDept?.name)

  // 3. Query all daily_reports for Registration department
  console.log('\n--- 3. Querying Registration daily_reports rows ---')
  const regReportsRes = await makeRequest(`/rest/v1/daily_reports?department_id=eq.${regDept.id}&select=id,event_id,event_day_id,status,metrics_data,created_at,updated_at`)
  const regReports = JSON.parse(regReportsRes.data)
  console.log('Registration daily_reports count:', regReports.length)
  regReports.forEach((r, idx) => {
    console.log(`\nRow #${idx + 1}:`)
    console.log('  ID:', r.id)
    console.log('  Event ID:', r.event_id)
    console.log('  Event Day ID:', r.event_day_id)
    console.log('  Status:', r.status)
    console.log('  Metrics Data JSON:', JSON.stringify(r.metrics_data, null, 2))
  })

  // 4. Query all daily_reports for the active event across ALL departments
  console.log('\n--- 4. Querying all daily_reports for active event ---')
  const allReportsRes = await makeRequest(`/rest/v1/daily_reports?event_id=eq.${activeEvent.id}&select=id,department_id,event_day_id,status,created_at`)
  const allReports = JSON.parse(allReportsRes.data)
  console.log('Total daily_reports for active event:', allReports.length)
  console.log('Statuses breakdown:', allReports.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {}))
}

runDiagnosis().catch(console.error)
