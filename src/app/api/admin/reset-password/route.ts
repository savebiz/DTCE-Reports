import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { generateCompliantPassword } from '@/lib/password-policy'
import { requireAuth } from '@/lib/auth/api-guard'

/**
 * POST /api/admin/reset-password
 * Super Admin endpoint to reset any system user's password.
 * Generates a new compliant password, sets must_change_password = true,
 * and logs the event to audit_logs.
 */
export async function POST(request: Request) {
  try {
    const { targetUserId } = await request.json()
    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
    }

    let actorId = 'super-admin'
    let actorRole = 'super_admin'

    if (isMock) {
      const user = store.currentUser
      if (user) {
        actorId = user.id
        actorRole = user.role
      }
    } else {
      // Role from profiles only. user_metadata is editable by the user, so
      // trusting it here would let anyone reset (and read) an admin's password.
      const auth = await requireAuth({ roles: ['super_admin'] })
      if (!auth.ok) {
        return auth.response.status === 403
          ? NextResponse.json({ error: 'Forbidden. Only Super Admin can reset user passwords.' }, { status: 403 })
          : auth.response
      }

      actorId = auth.ctx.userId
      actorRole = auth.ctx.role
    }

    // Generate new compliant temporary password using standard password-policy module
    const temporaryPassword = generateCompliantPassword()

    if (isMock) {
      // Mock mode execution
      const targetUser = store.profiles.find((p: any) => p.id === targetUserId)
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found in mock profiles' }, { status: 404 })
      }

      targetUser.must_change_password = true

      // Record in mock audit logs
      const auditLog: any = {
        id: `audit-${Date.now()}`,
        reviewer_id: actorId,
        actor_id: actorId,
        target_user_id: targetUserId,
        action: 'RESET_PASSWORD',
        details: `Reset password for ${targetUser.full_name || targetUser.username} (${targetUser.email})`,
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        previous_value: 'N/A',
        new_value: 'RESET_PASSWORD',
        report_id: 'SYSTEM_ADMIN'
      }
      store.auditLogs = [auditLog, ...(store.auditLogs || [])]

      return NextResponse.json({
        success: true,
        temporaryPassword,
        profile: targetUser
      })
    }

    // Live Supabase Execution
    const supabaseAdmin = getAdminClient()

    // 1. Fetch Target Profile
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single()

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: 'Target profile not found' }, { status: 404 })
    }

    // 2. Update Supabase Auth User Password & Metadata
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      {
        password: temporaryPassword,
        user_metadata: {
          ...(targetProfile.user_metadata || {}),
          must_change_password: true
        }
      }
    )

    if (authErr) {
      console.error('[Reset Password] Supabase Auth update failed:', authErr)
      return NextResponse.json({ error: `Auth update failed: ${authErr.message}` }, { status: 500 })
    }

    // 3. Update Profiles Table
    const { data: updatedProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId)
      .select()
      .single()

    if (profileErr) {
      console.warn('[Reset Password] Profile update warning:', profileErr)
    }

    // 4. Record Action in audit_logs Table
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actorId,
        target_user_id: targetUserId,
        action: 'RESET_PASSWORD',
        details: `Super Admin reset password for ${targetProfile.full_name || targetProfile.username} (${targetProfile.email})`,
        created_at: new Date().toISOString()
      })
    } catch (auditErr) {
      console.warn('[Reset Password] Failed to record audit log:', auditErr)
    }

    return NextResponse.json({
      success: true,
      temporaryPassword,
      profile: updatedProfile || targetProfile
    })
  } catch (err: any) {
    console.error('[Reset Password] Exception:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
