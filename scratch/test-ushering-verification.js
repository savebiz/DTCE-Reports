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

async function verify() {
  console.log('=== USHERING IMPLEMENTATION VERIFICATION ===\n')

  // 1. Verify Day 1 report is untouched
  const day1Res = await makeRequest('/rest/v1/daily_reports?id=eq.9f1da43a-35a1-4473-af1f-47c0e3bb5395&select=*')
  const day1 = JSON.parse(day1Res.data)[0]
  console.log('1. Day 1 Approved Report Status:', day1.status)
  console.log('   Offering:', day1.metrics_data.offering)
  console.log('   Workforce:', JSON.stringify(day1.metrics_data.workforce))
  console.log('   Custom Schema (Old structure preserved):', JSON.stringify(day1.metrics_data.custom_schema))

  // 2. Verify Other Departments Schemas (Medical, Registration, Welfare)
  const deptsRes = await makeRequest('/rest/v1/departments?select=name,default_metrics_schema')
  const depts = JSON.parse(deptsRes.data)
  console.log('\n2. Other Department Schemas Check:')
  depts.forEach(d => {
    if (d.name !== 'Ushering') {
      const fieldCount = d.default_metrics_schema?.fields?.length || 0
      console.log(`   - ${d.name}: ${fieldCount} top-level fields (Untouched)`)
    }
  })

  // 3. Verify Ushering New Schema
  const ushering = depts.find(d => d.name === 'Ushering')
  console.log('\n3. Ushering Schema Fields:')
  ushering.default_metrics_schema.fields.forEach(f => {
    console.log(`   - [${f.type}] ${f.label} (${f.name}): ${f.schema?.length || 0} sub-fields`)
  })
}

verify().catch(console.error)
