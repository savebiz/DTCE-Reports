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
  console.log('=== SECTION 0: USHERING DIAGNOSIS ===\n')

  // 1. Fetch Ushering Department info
  const deptsRes = await makeRequest('/rest/v1/departments?name=ilike.*Ushering*&select=*')
  const depts = JSON.parse(deptsRes.data)
  console.log('1. Ushering Department Data:')
  console.log(JSON.stringify(depts, null, 2))

  if (depts.length > 0) {
    const usheringId = depts[0].id

    // 2. Fetch all daily_reports for Ushering
    const reportsRes = await makeRequest(`/rest/v1/daily_reports?department_id=eq.${usheringId}&select=*,event_days(day_number,date)`)
    const reports = JSON.parse(reportsRes.data)
    console.log(`\n2. Existing Ushering Daily Reports Count: ${reports.length}`)
    reports.forEach((r, idx) => {
      console.log(`\n--- Report #${idx + 1} ---`)
      console.log(`  ID: ${r.id}`)
      console.log(`  Status: ${r.status}`)
      console.log(`  Day Number: ${r.event_days?.day_number || 'N/A'}`)
      console.log(`  Attendance Morning: ${r.attendance_morning}, Evening: ${r.attendance_evening}`)
      console.log(`  Metrics Data:`, JSON.stringify(r.metrics_data, null, 2))
    })
  }
}

test().catch(console.error)
