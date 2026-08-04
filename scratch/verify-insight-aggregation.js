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

async function verifyAggregation() {
  console.log('=== VERIFYING REGISTRATION INSIGHT AGGREGATION ===\n')

  const regDeptRes = await makeRequest('/rest/v1/departments?name=ilike.*registration*&select=id,name')
  const regDept = JSON.parse(regDeptRes.data)[0]

  const reportsRes = await makeRequest(`/rest/v1/daily_reports?department_id=eq.${regDept.id}&select=id,metrics_data,status`)
  const reports = JSON.parse(reportsRes.data)

  const categoryTotals = {
    teachers: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 },
    teens: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 },
    pre_teens: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 },
    children: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 }
  }

  let totalPickedUp = 0
  let totalWalkIn = 0
  let totalManuals = 0

  reports.forEach(report => {
    const metricsRaw = report.metrics_data || {}
    const custom = metricsRaw.custom_schema || {}

    const onlinePickups = (Array.isArray(custom.online_manual_pickups) && custom.online_manual_pickups.length > 0)
      ? custom.online_manual_pickups
      : (metricsRaw.online_manual_pickups || [])

    onlinePickups.forEach(item => {
      const catKey = (item.category || '').toLowerCase().replace('-', '_').replace(' ', '_')
      const count = Number(item.count_picked_up_today) || 0
      totalPickedUp += count
      if (catKey.includes('teacher')) categoryTotals.teachers.pickedUp += count
      else if (catKey.includes('teen') && !catKey.includes('pre')) categoryTotals.teens.pickedUp += count
      else if (catKey.includes('pre')) categoryTotals.pre_teens.pickedUp += count
      else if (catKey.includes('child')) categoryTotals.children.pickedUp += count
    })

    const walkins = (Array.isArray(custom.walkin_registrations) && custom.walkin_registrations.length > 0)
      ? custom.walkin_registrations
      : (metricsRaw.walkin_registrations || [])

    walkins.forEach(item => {
      const catKey = (item.category || '').toLowerCase().replace('-', '_').replace(' ', '_')
      const newRegs = Number(item.new_registrations) || 0
      const manuals = Number(item.manuals_distributed) || 0
      totalWalkIn += newRegs
      totalManuals += manuals
      if (catKey.includes('teacher')) {
        categoryTotals.teachers.walkInRegs += newRegs
        categoryTotals.teachers.manualsDistributed += manuals
      } else if (catKey.includes('teen') && !catKey.includes('pre')) {
        categoryTotals.teens.walkInRegs += newRegs
        categoryTotals.teens.manualsDistributed += manuals
      } else if (catKey.includes('pre')) {
        categoryTotals.pre_teens.walkInRegs += newRegs
        categoryTotals.pre_teens.manualsDistributed += manuals
      } else if (catKey.includes('child')) {
        categoryTotals.children.walkInRegs += newRegs
        categoryTotals.children.manualsDistributed += manuals
      }
    })
  })

  console.log('Category Totals:', categoryTotals)
  console.log('Total Online Picked Up:', totalPickedUp, '(Expected: 9270 + 34304 + 14732 = 58306)')
  console.log('Total Walk-in Registrations:', totalWalkIn, '(Expected: 8181)')
  console.log('Total Manuals Distributed:', totalManuals, '(Expected: 66487)')
}

verifyAggregation().catch(console.error)
