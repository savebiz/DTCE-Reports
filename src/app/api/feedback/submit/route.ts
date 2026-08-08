import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      profile_id,
      overall_satisfaction,
      daily_report_ease,
      requisition_ease,
      vs_paper_process,
      encountered_bugs,
      bugs_description,
      mobile_experience_rating,
      nps_score,
      top_improvement,
      additional_comments
    } = body

    if (!overall_satisfaction || !daily_report_ease || !requisition_ease || !vs_paper_process || nps_score === undefined || !top_improvement) {
      return NextResponse.json({ error: 'Missing required feedback fields.' }, { status: 400 })
    }

    const submitted_at = new Date().toISOString()
    const payload = {
      profile_id,
      submitted_at,
      overall_satisfaction: Number(overall_satisfaction),
      daily_report_ease: Number(daily_report_ease),
      requisition_ease: Number(requisition_ease),
      vs_paper_process,
      encountered_bugs: Boolean(encountered_bugs),
      bugs_description: bugs_description?.trim() || null,
      mobile_experience_rating: mobile_experience_rating ? Number(mobile_experience_rating) : null,
      nps_score: Number(nps_score),
      top_improvement: top_improvement.trim(),
      additional_comments: additional_comments?.trim() || null
    }

    if (isMock) {
      const feedbacks = store.platformFeedback || []
      feedbacks.push({
        id: 'pf-' + Math.random().toString(36).substr(2, 9),
        ...payload
      })
      store.platformFeedback = feedbacks

      // Permanently update profiles gate
      const profiles = store.profiles
      const pIdx = profiles.findIndex(p => p.id === profile_id)
      if (pIdx !== -1) {
        profiles[pIdx].feedback_submitted_at = submitted_at
        store.profiles = profiles
      }
      if (store.currentUser && store.currentUser.id === profile_id) {
        store.currentUser = {
          ...store.currentUser,
          feedback_submitted_at: submitted_at
        }
      }
    } else {
      const supabaseUserClient = await createServerClient()
      const { data: { user } } = await supabaseUserClient.auth.getUser()

      const activeProfileId = user?.id || profile_id
      payload.profile_id = activeProfileId

      const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      // Insert into platform_feedback using admin client (bypasses RLS mismatch)
      const { error: insertErr } = await supabaseAdmin.from('platform_feedback').insert(payload)
      if (insertErr) {
        console.error('Failed to insert platform_feedback:', insertErr)
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      // Update profiles feedback_submitted_at
      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ feedback_submitted_at: submitted_at })
        .eq('id', activeProfileId)

      if (updateErr) {
        console.error('Failed to update profile feedback_submitted_at:', updateErr)
      }
    }

    return NextResponse.json({ success: true, submitted_at })
  } catch (err: any) {
    console.error('Submit feedback route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
