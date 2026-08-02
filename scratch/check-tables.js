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
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
    'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE}`
  }
}

const req = https.request(options, res => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data)
      console.log('Tables:', Object.keys(parsed.definitions || {}))
    } catch (e) {
      console.log('Response:', data.slice(0, 300))
    }
  })
})
req.on('error', console.error)
req.end()
