const https = require('https')
const fs = require('fs')
const path = require('path')

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

const USHERING_NEW_SCHEMA = {
  schema_version: 2,
  fields: [
    {
      name: 'teachers_meeting',
      type: 'repeat-group',
      label: "TEACHERS' MEETING",
      schema: [
        { name: 'title', type: 'text', label: 'Title / Theme', required: false },
        { name: 'preacher', type: 'text', label: 'Preacher / Minister', required: false },
        { name: 'male', type: 'number', label: 'Male Attendance', required: false },
        { name: 'female', type: 'number', label: 'Female Attendance', required: false },
        {
          name: 'total',
          type: 'computed',
          label: 'Total Attendance',
          computeFormula: 'sum_fields',
          sumOf: ['male', 'female']
        },
        { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
      ]
    },
    {
      name: 'toddlers_section',
      type: 'repeat-group',
      label: 'TODDLERS SECTION',
      schema: [
        {
          name: 's_n',
          type: 'computed',
          label: 'S/N',
          computeFormula: 'row_index'
        },
        { name: 'event', type: 'text', label: 'Event / Session', required: false },
        { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
        { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
        { name: 'male', type: 'number', label: 'Male Attendance', required: false },
        { name: 'female', type: 'number', label: 'Female Attendance', required: false },
        {
          name: 'total',
          type: 'computed',
          label: 'Total Attendance',
          computeFormula: 'sum_fields',
          sumOf: ['male', 'female']
        },
        { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
        { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
        { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
      ]
    },
    {
      name: 'junior_section',
      type: 'repeat-group',
      label: 'JUNIOR SECTION',
      schema: [
        {
          name: 's_n',
          type: 'computed',
          label: 'S/N',
          computeFormula: 'row_index'
        },
        { name: 'event', type: 'text', label: 'Event / Session', required: false },
        { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
        { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
        { name: 'male', type: 'number', label: 'Male Attendance', required: false },
        { name: 'female', type: 'number', label: 'Female Attendance', required: false },
        {
          name: 'total',
          type: 'computed',
          label: 'Total Attendance',
          computeFormula: 'sum_fields',
          sumOf: ['male', 'female']
        },
        { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
        { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
        { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
      ]
    },
    {
      name: 'pre_teens_section',
      type: 'repeat-group',
      label: 'PRE-TEENS SECTION',
      schema: [
        {
          name: 's_n',
          type: 'computed',
          label: 'S/N',
          computeFormula: 'row_index'
        },
        { name: 'event', type: 'text', label: 'Event / Session', required: false },
        { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
        { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
        { name: 'male', type: 'number', label: 'Male Attendance', required: false },
        { name: 'female', type: 'number', label: 'Female Attendance', required: false },
        {
          name: 'total',
          type: 'computed',
          label: 'Total Attendance',
          computeFormula: 'sum_fields',
          sumOf: ['male', 'female']
        },
        { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
        { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
        { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
      ]
    },
    {
      name: 'teenagers_section',
      type: 'repeat-group',
      label: 'TEENAGERS SECTION',
      schema: [
        {
          name: 's_n',
          type: 'computed',
          label: 'S/N',
          computeFormula: 'row_index'
        },
        { name: 'event', type: 'text', label: 'Event / Session', required: false },
        { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
        { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
        { name: 'male', type: 'number', label: 'Male Attendance', required: false },
        { name: 'female', type: 'number', label: 'Female Attendance', required: false },
        {
          name: 'total',
          type: 'computed',
          label: 'Total Attendance',
          computeFormula: 'sum_fields',
          sumOf: ['male', 'female']
        },
        { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
        { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
        { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
      ]
    }
  ]
}

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

async function run() {
  console.log('=== UPDATING USHERING DEFAULT METRICS SCHEMA IN DB ===\n')

  const deptRes = await makeRequest('/rest/v1/departments?name=ilike.*Ushering*&select=*')
  const depts = JSON.parse(deptRes.data)

  if (depts.length === 0) {
    console.error('Ushering department not found!')
    return
  }

  const ushering = depts[0]
  console.log('Target Ushering Dept ID:', ushering.id)

  const updateRes = await makeRequest(`/rest/v1/departments?id=eq.${ushering.id}`, 'PATCH', {
    default_metrics_schema: USHERING_NEW_SCHEMA
  })

  console.log('Update Status:', updateRes.status, updateRes.data)

  const verifyRes = await makeRequest(`/rest/v1/departments?id=eq.${ushering.id}&select=*`)
  console.log('\nVerified New Ushering Schema in DB:')
  console.log(JSON.stringify(JSON.parse(verifyRes.data), null, 2))
}

run().catch(console.error)
