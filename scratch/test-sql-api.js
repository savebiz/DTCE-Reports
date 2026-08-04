const https = require('https')
const tls = require('tls')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Supabase Host:', url.hostname)

// Extract project reference from hostname (e.g. xyz.supabase.co -> xyz)
const projectRef = url.hostname.split('.')[0]
console.log('Project Ref:', projectRef)

// Test HTTP management / SQL endpoint
const options = {
  hostname: url.hostname,
  path: `/pg/v1/query`,
  method: 'POST',
  headers: {
    'apikey': env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
    'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE}`,
    'Content-Type': 'application/json'
  }
}

const req = https.request(options, res => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => console.log('SQL API test response:', res.statusCode, data))
})

req.on('error', err => console.log('Req error:', err.message))
req.write(JSON.stringify({ query: 'SELECT 1;' }))
req.end()
