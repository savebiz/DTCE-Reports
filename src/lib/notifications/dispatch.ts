import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { sendWebPushNotification, PushSubscriptionObj } from './webpush'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export interface NotifyParams {
  recipientId: string
  type: 
    | 'requisition_submitted'
    | 'requisition_approved'
    | 'requisition_rejected'
    | 'requisition_fulfilled'
    | 'requisition_routed_to_stores'
    | 'requisition_stale'
    | 'missing_report_reminder'
    | 'secretariat_summary'
    | 'low_stock_alert'
    | string
  title: string
  body: string
  relatedEntity?: {
    type: 'requisition' | 'report' | 'system'
    id: string
  }
}

export interface DispatchResult {
  inAppCreated: boolean
  emailSent: boolean
  pushSent: boolean
  notificationId?: string
  error?: string
}

/**
 * Shared Unified Dispatch Function for all platform notifications.
 * 1. Inserts in-app notification row (triggers Supabase Realtime update to user's bell icon).
 * 2. Checks recipient notification_preferences for email/push toggles.
 * 3. Sends email via Resend if email_enabled.
 * 4. Dispatches Web Push payload if push_enabled and subscription exists.
 */
export async function notify(params: NotifyParams): Promise<DispatchResult> {
  const { recipientId, type, title, body, relatedEntity } = params
  const resResult: DispatchResult = { inAppCreated: false, emailSent: false, pushSent: false }

  try {
    let recipientProfile: any = null
    let prefs: { email_enabled: boolean; push_enabled: boolean } = { email_enabled: true, push_enabled: true }
    let pushSubs: PushSubscriptionObj[] = []
    let insertedNotifId = `notif-${Math.random().toString(36).substr(2, 9)}`

    // --- A. DATA FETCHING & IN-APP ROW INSERTION ---
    if (isMock) {
      // Mock Mode Execution
      recipientProfile = store.profiles.find(p => p.id === recipientId)
      
      const notifRow = {
        id: insertedNotifId,
        recipient_id: recipientId,
        type,
        title,
        body,
        related_entity_type: relatedEntity?.type || 'requisition',
        related_entity_id: relatedEntity?.id || '',
        read: false,
        created_at: new Date().toISOString()
      }
      
      store.notificationLogs = [notifRow, ...store.notificationLogs]
      resResult.inAppCreated = true
      resResult.notificationId = insertedNotifId
    } else {
      // Production Supabase Execution
      const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

      let supabase: any
      if (serviceKey && supabaseUrl) {
        supabase = createSupabaseAdminClient(supabaseUrl, serviceKey)
      } else {
        supabase = await createServerClient()
      }

      // 1. Fetch Recipient Profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', recipientId)
        .maybeSingle()

      recipientProfile = prof

      // 2. Fetch Recipient Preferences for this notification_type
      const { data: prefRow } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('profile_id', recipientId)
        .eq('notification_type', type)
        .maybeSingle()

      if (prefRow) {
        prefs.email_enabled = prefRow.email_enabled !== false
        prefs.push_enabled = prefRow.push_enabled !== false
      }

      // 3. Fetch Recipient Push Subscriptions
      const { data: subsData } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('profile_id', recipientId)

      if (subsData && subsData.length > 0) {
        pushSubs = subsData.map((s: any) => ({
          endpoint: s.endpoint,
          keys: s.keys
        }))
      }

      // 4. Insert Row into notifications Table (In-App)
      const { data: notifData, error: notifErr } = await supabase
        .from('notifications')
        .insert({
          recipient_id: recipientId,
          type,
          title,
          body,
          related_entity_type: relatedEntity?.type || 'requisition',
          related_entity_id: relatedEntity?.id || null,
          read: false,
        })
        .select()
        .single()

      if (!notifErr && notifData) {
        resResult.inAppCreated = true
        resResult.notificationId = notifData.id
      }
    }

    // If recipient profile missing, exit early
    if (!recipientProfile || !recipientProfile.email) {
      console.warn(`[Notify] Recipient profile or email not found for ID: ${recipientId}`)
      return resResult
    }

    // --- B. EMAIL CHANNEL DISPATCH ---
    if (prefs.email_enabled) {
      const resendApiKey = process.env.RESEND_API_KEY
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dtce-reports.vercel.app'
      const actionUrl = relatedEntity?.type === 'requisition'
        ? `${appUrl}/dashboard/store-requisitions?id=${relatedEntity.id}`
        : `${appUrl}/dashboard`

      if (resendApiKey) {
        try {
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #06090F; color: #F1F5F9; margin: 0; padding: 24px; }
                .container { max-width: 560px; margin: 0 auto; background: #0F1A2E; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; }
                .brand { color: #F59E0B; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
                .title { font-size: 18px; font-weight: 700; color: #FFFFFF; margin: 0 0 12px 0; }
                .body { font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px; white-space: pre-wrap; }
                .button { display: inline-block; background: #3B82F6; color: #FFFFFF !important; text-decoration: none; font-weight: 600; font-size: 13px; padding: 10px 20px; border-radius: 8px; }
                .footer { font-size: 11px; color: #475569; margin-top: 24px; border-t: 1px solid rgba(255,255,255,0.05); padding-top: 16px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="brand">DTCE Reporting System</div>
                <h2 class="title">${title}</h2>
                <div class="body">${body}</div>
                <a href="${actionUrl}" class="button">View Details in DTCE App &rarr;</a>
                <div class="footer">DTCE Junior Church Global &bull; Automated Operations Alert</div>
              </div>
            </body>
            </html>
          `

          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendApiKey}`
            },
            body: JSON.stringify({
              from: 'DTCE Reporting System <notifications@dtce.org>',
              to: recipientProfile.email,
              subject: title,
              html: emailHtml,
              text: `${title}\n\n${body}\n\nView details: ${actionUrl}`
            })
          })

          if (emailRes.ok) {
            resResult.emailSent = true
          } else {
            console.warn(`[Notify] Resend email failed with status ${emailRes.status}`)
          }
        } catch (emailErr: any) {
          console.error('[Notify] Email dispatch error:', emailErr)
        }
      } else {
        // Simulated email in development / mock mode
        console.log(`[Notify Mock Email] Sent to ${recipientProfile.email}: ${title}`)
        resResult.emailSent = true
      }
    }

    // --- C. WEB PUSH CHANNEL DISPATCH ---
    if (prefs.push_enabled && pushSubs.length > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dtce-reports.vercel.app'
      const pushUrl = relatedEntity?.type === 'requisition'
        ? `${appUrl}/dashboard/store-requisitions?id=${relatedEntity.id}`
        : `${appUrl}/dashboard`

      for (const sub of pushSubs) {
        const pushRes = await sendWebPushNotification(sub, {
          title,
          body,
          url: pushUrl,
          tag: `dtce-${type}-${relatedEntity?.id || 'alert'}`
        })

        if (pushRes.success) {
          resResult.pushSent = true
        } else if (pushRes.status === 404 || pushRes.status === 410) {
          // Clean up expired endpoint if live Supabase is active
          if (!isMock) {
            const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
            if (serviceKey && supabaseUrl) {
              const adminSupabase = createSupabaseAdminClient(supabaseUrl, serviceKey)
              await adminSupabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
          }
        }
      }
    }

    return resResult
  } catch (err: any) {
    console.error('[Notify] Dispatch exception:', err)
    resResult.error = err.message
    return resResult
  }
}

/**
 * Moment-of-Deduction Low Stock Alert Dispatcher.
 * Triggered at the exact moment stock drops to or below threshold during fulfillment.
 * Sends alert to Stores Department Staff/HOD and National Coordinator via shared notify().
 */
export async function checkAndDispatchLowStockAlert(params: {
  itemId: string
  name: string
  currentStock: number
  unit: string
  threshold: number
}) {
  const { itemId, name, currentStock, unit, threshold } = params
  if (currentStock > threshold) return

  const title = `Low Stock Alert: ${name}`
  const body = `Low stock alert: ${name} is at ${currentStock} ${unit} (threshold: ${threshold}).`

  if (isMock) {
    // Notify Stores Staff/HOD and National Coordinator in Mock Mode
    const recipients = store.profiles.filter(p =>
      p.role === 'national_coordinator' ||
      p.role === 'super_admin' ||
      p.email?.includes('stores') ||
      p.email?.includes('store')
    )

    for (const r of recipients) {
      await notify({
        recipientId: r.id,
        type: 'low_stock_alert',
        title,
        body,
        relatedEntity: { type: 'system', id: itemId }
      })
    }
    return
  }

  // Live Supabase Execution
  const serviceKey =
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !serviceKey) return

  const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, serviceKey)

  // 1. Fetch National Coordinator(s)
  const { data: natCoords } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'national_coordinator')

  // 2. Fetch Stores Department Staff / HOD
  const { data: storesDept } = await supabaseAdmin
    .from('departments')
    .select('id')
    .ilike('name', '%store%')
    .maybeSingle()

  let storesStaff: any[] = []
  if (storesDept?.id) {
    const { data: staff } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('department_id', storesDept.id)
    storesStaff = staff || []
  }

  // Combine unique recipient IDs
  const recipientIds = new Set<string>()
  if (natCoords) natCoords.forEach(c => recipientIds.add(c.id))
  if (storesStaff) storesStaff.forEach(s => recipientIds.add(s.id))

  for (const recipientId of Array.from(recipientIds)) {
    await notify({
      recipientId,
      type: 'low_stock_alert',
      title,
      body,
      relatedEntity: { type: 'system', id: itemId }
    })
  }
}
