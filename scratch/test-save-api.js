const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

async function test() {
  console.log('=== TESTING PRE-EVENT SAVING VIA ADMIN CLIENT ===\n')
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE)

  const { data: depts } = await supabase.from('departments').select('id, name, default_metrics_schema')
  const regDept = depts.find(d => d.name && d.name.toLowerCase().includes('registration'))

  const totals = { teachers: 10857, teens: 39793, pre_teens: 17269, children: 9616 }
  const currentSchema = regDept.default_metrics_schema || {}
  const updatedSchema = { ...currentSchema, pre_event_online_totals: totals }

  const { error } = await supabase.from('departments').update({ default_metrics_schema: updatedSchema }).eq('id', regDept.id)

  if (error) {
    console.error('Update error:', error)
  } else {
    console.log('Update SUCCESS!')
    const { data: check } = await supabase.from('departments').select('id, name, default_metrics_schema').eq('id', regDept.id)
    console.log('Saved Pre-event Totals:', check[0].default_metrics_schema.pre_event_online_totals)
  }
}

test().catch(console.error)
