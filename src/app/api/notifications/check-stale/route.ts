import { NextResponse, type NextRequest } from 'next/server'
import { notify } from '@/lib/notifications/dispatch'
import { isMock, mockDepartments } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const thresholdHours = Number(searchParams.get('hours') || '12')
    const performCleanup = searchParams.get('cleanup') === 'true'
    const cutoffTime = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()

    let pendingReqs: any[] = []
    let profiles: any[] = []
    let departments: any[] = []
    let cleanedSubscriptionsCount = 0

    if (!isMock) {
      const serviceKey =
        process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (serviceKey && supabaseUrl) {
        const supabase = createSupabaseAdminClient(supabaseUrl, serviceKey)

        // 1. Perform automated cleanup of stale push subscriptions (>30 days old or duplicate endpoints)
        if (performCleanup) {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          const { data: staleSubs } = await supabase
            .from('push_subscriptions')
            .delete()
            .lte('created_at', thirtyDaysAgo)
            .select()

          cleanedSubscriptionsCount = staleSubs ? staleSubs.length : 0
        }

        const { data: reqs } = await supabase
          .from('store_requests')
          .select('*')
          .eq('status', 'pending_coordinator')
          .lte('created_at', cutoffTime)

        pendingReqs = reqs || []

        const { data: profs } = await supabase.from('profiles').select('*')
        profiles = profs || []

        const { data: depts } = await supabase.from('departments').select('*')
        departments = depts || []
      }
    } else {
      pendingReqs = (store as any).storeRequests?.filter((r: any) => 
        r.status === 'pending_coordinator' && r.created_at <= cutoffTime
      ) || []
      profiles = store.profiles
      departments = mockDepartments
    }

    if (pendingReqs.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No requisitions pending for >${thresholdHours} hours`,
        stale_count: 0,
        cleaned_subscriptions_count: cleanedSubscriptionsCount
      })
    }

    // Find National Coordinator and Super Admin recipients
    const recipients = profiles.filter(p => p.role === 'national_coordinator' || p.role === 'super_admin' || p.role === 'coordinator')

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No National Coordinator or Admin recipients found' }, { status: 404 })
    }

    // Build aggregated summary digest string
    const summaryLines = pendingReqs.map((r, i) => {
      const dept = departments.find(d => d.id === r.department_id)
      const itemCount = r.items_json?.length || 0
      const createdDate = new Date(r.created_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      return `${i + 1}. ${dept?.name || 'Department'} Requisition — ${itemCount} items requested on ${createdDate}`
    }).join('\n')

    const digestTitle = `Overdue Requisitions Alert: ${pendingReqs.length} Requisitions Awaiting Approval`
    const digestBody = `There are currently ${pendingReqs.length} store requisitions that have been pending review for over ${thresholdHours} hours:\n\n${summaryLines}\n\nPlease log in to review and approve these items.`

    const dispatchResults: any[] = []

    for (const recipient of recipients) {
      const result = await notify({
        recipientId: recipient.id,
        type: 'requisition_stale',
        title: digestTitle,
        body: digestBody,
        relatedEntity: {
          type: 'requisition',
          id: pendingReqs[0].id
        }
      })
      dispatchResults.push({ recipientId: recipient.id, email: recipient.email, result })
    }

    return NextResponse.json({
      success: true,
      threshold_hours: thresholdHours,
      stale_count: pendingReqs.length,
      recipients_notified: recipients.length,
      cleaned_subscriptions_count: cleanedSubscriptionsCount,
      dispatchResults
    })
  } catch (err: any) {
    console.error('[CheckStale] Error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
