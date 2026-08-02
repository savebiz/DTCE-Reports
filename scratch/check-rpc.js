const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
const options = {
  hostname: url.hostname,
  path: '/rest/v1/rpc/',
  method: 'GET',
  headers: {
    'apikey': env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
    'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE}`
  }
}

console.log('Checking RPC endpoints...')
const req = https.request(options, res => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => console.log('RPC response:', res.statusCode, data.slice(0, 300)))
})
req.on('error', console.error)
req.end()
