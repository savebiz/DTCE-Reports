/**
 * QA Cleanup Script — Removes all disposable `qa.*` accounts and optionally
 * removes records authored by those QA accounts before production rollout.
 *
 * Usage:
 *   node --env-file=.env.local scripts/qa-cleanup.mjs --confirm
 *   node --env-file=.env.local scripts/qa-cleanup.mjs --confirm --wipe-qa-data
 */

import { createClient } from '@supabase/supabase-js'

const args = new Set(process.argv.slice(2))
if (!args.has('--confirm')) {
  console.error('Refusing to run without --confirm flag.')
  console.error('Usage: node --env-file=.env.local scripts/qa-cleanup.mjs --confirm [--wipe-qa-data]')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const wipeQaData = args.has('--wipe-qa-data')

async function main() {
  const { data: qaProfiles, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, username, email')
    .ilike('username', 'qa.%')

  if (fetchErr) throw new Error(`Failed to list QA profiles: ${fetchErr.message}`)

  if (!qaProfiles || qaProfiles.length === 0) {
    console.log('No qa.* accounts found. Nothing to clean up.')
    return
  }

  const qaIds = qaProfiles.map((p) => p.id)
  console.log(`Found ${qaProfiles.length} QA account(s): ${qaProfiles.map((p) => p.username).join(', ')}`)

  if (wipeQaData) {
    console.log('Wiping test rows authored by QA accounts...')
    await supabase.from('daily_reports').delete().in('submitted_by', qaIds)
    await supabase.from('store_requests').delete().in('requester_profile_id', qaIds)
    await supabase.from('market_list_entries').delete().in('updated_by', qaIds)
    await supabase.from('inventory_transactions').delete().in('performed_by', qaIds)
    await supabase.from('department_narratives').delete().in('submitted_by', qaIds)
  }

  await supabase.from('hod_assignments').delete().in('profile_id', qaIds)
  await supabase.from('profiles').delete().in('id', qaIds)

  for (const p of qaProfiles) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(p.id)
    if (delErr) {
      console.warn(`Warning: Could not delete auth user ${p.username} (${p.id}): ${delErr.message}`)
    } else {
      console.log(`Removed QA account: ${p.username}`)
    }
  }

  console.log('QA cleanup complete.')
}

main().catch((err) => {
  console.error('QA Cleanup Error:', err.message)
  process.exit(1)
})
