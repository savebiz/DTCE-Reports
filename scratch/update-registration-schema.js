const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

const registrationSchema = {
  fields: [
    {
      name: 'online_manual_pickups',
      type: 'repeat-group',
      label: 'SECTION A — Online Manual Pickup (Today)',
      schema: [
        { name: 'category', type: 'select', label: 'Category', options: ['Teachers', 'Teens', 'Pre-teens', 'Children'], required: true },
        { name: 'count_picked_up_today', type: 'number', label: 'Manuals Picked Up Today', required: true }
      ]
    },
    {
      name: 'walkin_registrations',
      type: 'repeat-group',
      label: 'SECTION B — Offline / Walk-in Registration (Today)',
      schema: [
        { name: 'category', type: 'select', label: 'Category', options: ['Teachers', 'Teens', 'Pre-teens', 'Children'], required: true },
        { name: 'new_registrations', type: 'number', label: 'New Registrations Today', required: true },
        { name: 'manuals_distributed', type: 'number', label: 'Manuals Distributed Today', required: true },
        { name: 'amount_collected', type: 'number', label: 'Amount Collected (₦)', required: true }
      ]
    }
  ]
}

const payload = JSON.stringify({ default_metrics_schema: registrationSchema })

const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
const options = {
  hostname: url.hostname,
  path: '/rest/v1/departments?name=ilike.*registration*',
  method: 'PATCH',
  headers: {
    'apikey': env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
    'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
}

const req = https.request(options, res => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => console.log('Update result:', res.statusCode, data))
})

req.on('error', console.error)
req.write(payload)
req.end()
