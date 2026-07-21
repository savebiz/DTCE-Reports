const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Manual env parsing
const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      process.env[key] = value
    }
  })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabaseAdmin = createClient(url, key)

async function main() {
  console.log('🔍 Listing all Auth Users to confirm emails...')
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) {
    console.error('Failed to list users:', error)
    process.exit(1)
  }

  const users = data.users
  console.log(`Found ${users.length} total user accounts in Auth.`)

  for (const user of users) {
    if (!user.email_confirmed_at) {
      console.log(`✉️ Confirming email for user ${user.email} (${user.id})...`)
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email_confirm: true
      })
      if (updateErr) {
        console.error(`❌ Failed to confirm ${user.email}:`, updateErr.message)
      } else {
        console.log(`✅ Successfully confirmed ${user.email}`)
      }
    }
  }

  console.log('🎉 All user emails confirmed!')
}

main()
