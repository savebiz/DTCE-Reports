'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { validatePassword } from '@/lib/password-policy'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Validation feedback
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] }>({
    valid: true,
    errors: []
  })
  const [hasTyped, setHasTyped] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch profile with fallback if database row is missing
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      let activeProfile = prof
      if (!activeProfile && user) {
        const meta = user.user_metadata as any
        activeProfile = {
          id: user.id,
          email: user.email || '',
          full_name: meta?.full_name || user.email?.split('@')[0] || 'User',
          role: meta?.role || 'hod',
          department_id: meta?.department_id,
          username: meta?.username || user.email?.split('@')[0] || 'user',
          must_change_password: true,
          is_active: true
        }
      }

      if (activeProfile) {
        setProfile(activeProfile)
        // If they don't actually need to reset, redirect them away
        if (!activeProfile.must_change_password) {
          const path = (activeProfile.role === 'super_admin' || activeProfile.role === 'coordinator') ? '/dashboard' : '/my-department'
          router.push(path)
        }
      } else {
        router.push('/login')
      }
    }
    checkUser()
  }, [])

  // Live validation as user types
  const handlePasswordChange = (val: string) => {
    setNewPassword(val)
    setHasTyped(true)
    setSubmitError(null)
    
    const result = validatePassword(val, profile?.username || '')
    setValidation(result)

    if (confirmPassword && val !== confirmPassword) {
      setConfirmError('Passwords do not match.')
    } else {
      setConfirmError(null)
    }
  }

  const handleConfirmPasswordChange = (val: string) => {
    setConfirmPassword(val)
    setSubmitError(null)

    if (newPassword && val !== newPassword) {
      setConfirmError('Passwords do not match.')
    } else {
      setConfirmError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !confirmPassword || !profile) return

    // Run final validation
    const result = validatePassword(newPassword, profile.username || '')
    if (!result.valid) {
      setValidation(result)
      setHasTyped(true)
      setSubmitError('Please satisfy all password strength requirements.')
      return
    }

    if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match.')
      return
    }

    setLoading(true)
    setSubmitError(null)
    const supabase = getClient()

    try {
      // 1. Update Auth password
      if (!isMock) {
        const { error: authErr } = await (supabase.auth as any).updateUser({
          password: newPassword
        })
        if (authErr) throw authErr
      }

      // 2. Update profiles table: must_change_password = false
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', profile.id)

      if (dbErr) throw dbErr

      alert('Password updated successfully! Welcome to DTCE Reporting.')
      const path = (profile.role === 'super_admin' || profile.role === 'coordinator') ? '/dashboard' : '/my-department'
      window.location.href = path // hard redirect refreshes sessions/middleware
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred while updating your password.')
    } finally {
      setLoading(false)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: '#06090F' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Checking credentials...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 font-sans bg-mesh" style={{ background: '#06090F' }}>
      <div className="w-full max-w-md space-y-6 animate-fade-in-up">
        
        {/* Header Block */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <span className="text-amber-400 text-lg">🔒</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Secure Your Account</h1>
          <p className="text-[13px] text-slate-500 max-w-xs mx-auto">
            This is your first login with an admin-provisioned credential. You must set a personalized password to continue.
          </p>
        </div>

        {/* Card Wrapper */}
        <div className="glass-card p-6 space-y-5">
          <div className="flex flex-col gap-0.5 border-b pb-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">First-Time Setup</span>
            <span className="text-[13px] text-slate-300 font-medium">Logged in as: <span className="text-white font-bold">{profile.full_name}</span> ({profile.username})</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* New Password input */}
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                placeholder="Enter compliant password"
                value={newPassword}
                onChange={(e) => handlePasswordChange(e.target.value)}
                required
                disabled={loading}
                className="input-dark"
              />
              
              {/* Password strength checklist */}
              {hasTyped && (
                <div className="rounded-xl p-3.5 space-y-2 mt-2 text-[12px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Strength Requirements</p>
                  
                  <ul className="space-y-1.5 font-mono text-[11px]">
                    {[
                      { label: 'Minimum 8 characters', ok: newPassword.length >= 8 },
                      { label: 'At least 1 uppercase letter', ok: /[A-Z]/.test(newPassword) },
                      { label: 'At least 1 lowercase letter', ok: /[a-z]/.test(newPassword) },
                      { label: 'At least 1 digit', ok: /\d/.test(newPassword) },
                      { label: 'At least 1 special char (!@#$%&*?-)', ok: /[!@#\$%&\*\?-]/.test(newPassword) },
                      { label: 'Does not contain username', ok: !newPassword.toLowerCase().includes((profile.username || '').toLowerCase()) }
                    ].map((rule, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="text-[12px] font-bold" style={{ color: rule.ok ? '#10B981' : '#EF4444' }}>
                          {rule.ok ? '✓' : '✗'}
                        </span>
                        <span style={{ color: rule.ok ? '#94A3B8' : '#FCA5A5' }}>
                          {rule.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password input */}
            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                required
                disabled={loading}
                className="input-dark"
              />
              {confirmError && (
                <p className="text-[11px] text-red-400 font-medium mt-1">⚠️ {confirmError}</p>
              )}
            </div>

            {/* Form-level errors */}
            {submitError && (
              <div className="rounded-xl p-3 text-[12px]" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
                ⚠️ {submitError}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !validation.valid || !!confirmError}
              className="w-full rounded-xl py-3 text-[13px] font-bold text-white transition-all duration-200 mt-2"
              style={{
                background: (loading || !validation.valid || !!confirmError) ? 'rgba(30,64,175,0.4)' : 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: (loading || !validation.valid || !!confirmError) ? '#94A3B8' : 'white',
                cursor: (loading || !validation.valid || !!confirmError) ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Updating Password...' : '➔ Save Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
