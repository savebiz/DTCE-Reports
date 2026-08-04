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

function extractCustomMetricsSummary(reports) {
  const summaryMap = {} // key -> { label, counts: { subKey: total } }

  reports.forEach((r, dayIdx) => {
    const mData = r.metrics_data || {}
    const custom = mData.custom_schema || mData

    Object.keys(custom).forEach(key => {
      if (['offering', 'workforce', 'daily_narrative', 'attendance_morning', 'attendance_evening'].includes(key)) return

      const val = custom[key]
      if (Array.isArray(val) && val.length > 0) {
        if (!summaryMap[key]) {
          summaryMap[key] = { key, items: {} }
        }

        val.forEach(item => {
          // Identify category/name label & numeric values
          const nameLabel = item.category || item.diagnosis || item.item_name || item.name || item.type || 'General'
          
          Object.keys(item).forEach(prop => {
            if (['category', 'diagnosis', 'item_name', 'name', 'type'].includes(prop)) return
            const numVal = Number(item[prop])
            if (!isNaN(numVal) && numVal > 0) {
              const subKey = `${nameLabel} (${prop.replace(/_/g, ' ')})`
              summaryMap[key].items[subKey] = (summaryMap[key].items[subKey] || 0) + numVal
            }
          })
        })
      } else if (typeof val === 'number' && val > 0) {
        if (!summaryMap[key]) summaryMap[key] = { key, items: {} }
        summaryMap[key].items[key.replace(/_/g, ' ')] = (summaryMap[key].items[key.replace(/_/g, ' ')] || 0) + val
      }
    })
  })

  // Format into clean lines
  const lines = []
  Object.keys(summaryMap).forEach(key => {
    const groupName = key.replace(/_/g, ' ').toUpperCase()
    const items = summaryMap[key].items
    const subLines = Object.keys(items).map(k => `${k}: ${items[k].toLocaleString()}`)
    if (subLines.length > 0) {
      lines.push(`${groupName}: ${subLines.join(' | ')}`)
    }
  })

  return lines
}

async function test() {
  console.log('=== TESTING CUSTOM METRICS SUMMARIZER ===\n')

  const reportsRes = await makeRequest('/rest/v1/daily_reports?select=*')
  const reports = JSON.parse(reportsRes.data)

  const deptsRes = await makeRequest('/rest/v1/departments?select=*')
  const depts = JSON.parse(deptsRes.data)

  depts.forEach(d => {
    const dReports = reports.filter(r => r.department_id === d.id)
    const summary = extractCustomMetricsSummary(dReports)
    if (summary.length > 0) {
      console.log(`Department: [${d.name}]`)
      summary.forEach(line => console.log('  •', line))
      console.log('')
    }
  })
}

test().catch(console.error)
