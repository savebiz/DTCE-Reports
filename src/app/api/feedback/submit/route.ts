import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'

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
      const feedbacks = store.platformFeedback
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
      const supabase = await createClient()
      
      // Insert into platform_feedback
      const { error: insertErr } = await supabase.from('platform_feedback').insert(payload)
      if (insertErr) {
        console.error('Failed to insert platform_feedback:', insertErr)
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      // Update profiles feedback_submitted_at
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ feedback_submitted_at: submitted_at })
        .eq('id', profile_id)

      if (updateErr) {
        console.error('Failed to update profile feedback_submitted_at:', updateErr)
      }
    }

    return NextResponse.json({ success: true, submitted_at })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
