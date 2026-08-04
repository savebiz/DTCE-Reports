const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

const projectRef = 'vmwlpakvhfwpjjxelsis'

async function querySupabase(endpoint, token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.supabase.com',
      path: endpoint,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, data }))
    })
    req.on('error', e => resolve({ status: 500, data: e.message }))
    req.write(JSON.stringify({ query: 'SELECT 1;' }))
    req.end()
  })
}

async function test() {
  console.log('Testing Management API with service role key...')
  const r1 = await querySupabase(`/v1/projects/${projectRef}/db/query`, env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE)
  console.log('r1 status:', r1.status, r1.data)
}

test()
