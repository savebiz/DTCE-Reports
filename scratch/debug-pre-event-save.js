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
      method: method,
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

async function test() {
  console.log('=== DEBUG PRE-EVENT SAVING ===\n')

  const deptRes = await makeRequest('/rest/v1/departments?name=ilike.*Registration*&select=id,name,default_metrics_schema')
  const depts = JSON.parse(deptRes.data)
  console.log('Registration Dept:', JSON.stringify(depts, null, 2))

  if (depts.length > 0) {
    const reg = depts[0]
    const schema = reg.default_metrics_schema || {}
    const totals = { teachers: 10857, teens: 39793, pre_teens: 17269, children: 9616 }
    const updatedSchema = { ...schema, pre_event_online_totals: totals }

    const updateRes = await makeRequest(`/rest/v1/departments?id=eq.${reg.id}`, 'PATCH', { default_metrics_schema: updatedSchema })
    console.log('Update Status:', updateRes.status, updateRes.data)

    const checkRes = await makeRequest('/rest/v1/departments?name=ilike.*Registration*&select=id,name,default_metrics_schema')
    console.log('Updated Dept:', JSON.stringify(JSON.parse(checkRes.data), null, 2))
  }
}

test().catch(console.error)
