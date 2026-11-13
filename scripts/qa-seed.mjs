/**
 * QA Seed Script — Creates disposable `qa.*` accounts for pre-rollout UAT.
 *
 * Usage:
 *   node --env-file=.env.local scripts/qa-seed.mjs
 *   QA_PASSWORD="YourStrongQaPassword!" node --env-file=.env.local scripts/qa-seed.mjs
 *
 * Never use live user accounts for testing. Remove all `qa.*` accounts before
 * go-live using `scripts/qa-cleanup.mjs --confirm`.
 */

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const qaPassword =
  process.env.QA_PASSWORD ||
  `Qa!${crypto.randomBytes(6).toString('base64url')}9`

const QA_ACCOUNTS = [
  { username: 'qa.superadmin', fullName: 'QA Super Admin', role: 'super_admin', deptMatch: null, roleInEvent: null },
  { username: 'qa.natcoord', fullName: 'QA National Coordinator', role: 'national_coordinator', deptMatch: null, roleInEvent: null },
  { username: 'qa.coord', fullName: 'QA Coordinator', role: 'coordinator', deptMatch: null, roleInEvent: null },
  { username: 'qa.finance', fullName: 'QA Finance HOD', role: 'hod', deptMatch: 'finance', roleInEvent: 'hod' },
  { username: 'qa.stores', fullName: 'QA Stores HOD', role: 'hod', deptMatch: 'store', roleInEvent: 'hod' },
  { username: 'qa.ushering', fullName: 'QA Ushering HOD', role: 'hod', deptMatch: 'ushering', roleInEvent: 'hod' },
  { username: 'qa.medical', fullName: 'QA Medical HOD', role: 'hod', deptMatch: 'medical', roleInEvent: 'hod' },
  { username: 'qa.registration', fullName: 'QA Registration HOD', role: 'hod', deptMatch: 'registration', roleInEvent: 'hod' },
  { username: 'qa.biblestudy', fullName: 'QA Bible Study HOD', role: 'hod', deptMatch: 'bible study', roleInEvent: 'hod' },
  { username: 'qa.secretariat', fullName: 'QA Secretariat HOD', role: 'hod', deptMatch: 'secretariat', roleInEvent: 'hod' },
  { username: 'qa.assistant', fullName: 'QA Ushering Assistant', role: 'assistant', deptMatch: 'ushering', roleInEvent: 'assistant' },
]

async function main() {
  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('is_current', true)
    .maybeSingle()

  if (evErr || !event) {
    throw new Error(`Could not resolve current event: ${evErr?.message || 'None marked is_current=true'}`)
  }

  const { data: departments, error: deptErr } = await supabase
    .from('departments')
    .select('id, name')

  if (deptErr) throw new Error(`Failed to fetch departments: ${deptErr.message}`)

  const findDept = (needle) => {
    if (!needle) return null
    const low = needle.toLowerCase()
    return (departments || []).find((d) => d.name.toLowerCase().includes(low)) || null
  }

  console.log(`\nSeeding QA accounts for event: ${event.name} (${event.status})\n`)
  const results = []

  for (const spec of QA_ACCOUNTS) {
    const email = `${spec.username}@accounts.dtcereports.vercel.app`
    const dept = findDept(spec.deptMatch)

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', spec.username)
      .maybeSingle()

    let userId = existingProfile?.id

    if (!userId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: qaPassword,
        email_confirm: true,
        user_metadata: {
          full_name: spec.fullName,
          role: spec.role,
          username: spec.username,
          must_change_password: false,
        },
      })
      if (createErr) {
        throw new Error(`Auth create failed for ${spec.username}: ${createErr.message}`)
      }
      userId = created.user.id
    } else {
      await supabase.auth.admin.updateUserById(userId, {
        password: qaPassword,
        user_metadata: {
          full_name: spec.fullName,
          role: spec.role,
          username: spec.username,
          must_change_password: false,
        },
      })
    }

    const { error: profErr } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      username: spec.username,
      full_name: spec.fullName,
      role: spec.role,
      must_change_password: false,
      is_active: true,
    })

    if (profErr) {
      throw new Error(`Profile upsert failed for ${spec.username}: ${profErr.message}`)
    }

    if (dept && spec.roleInEvent) {
      await supabase
        .from('hod_assignments')
        .delete()
        .eq('event_id', event.id)
        .eq('profile_id', userId)

      const { error: assignErr } = await supabase.from('hod_assignments').insert({
        event_id: event.id,
        profile_id: userId,
        department_id: dept.id,
        role_in_event: spec.roleInEvent,
      })
      if (assignErr) {
        throw new Error(`Assignment failed for ${spec.username}: ${assignErr.message}`)
      }
    }

    results.push({
      username: spec.username,
      role: spec.role,
      department: dept ? dept.name : '— (Global)',
      password: qaPassword,
    })
  }

  console.table(results)
  console.log('Done. Remember to run `node --env-file=.env.local scripts/qa-cleanup.mjs --confirm` before rollout.\n')
}

main().catch((err) => {
  console.error('QA Seed Error:', err.message)
  process.exit(1)
})
