'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock } from '@/utils/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showForgotMsg, setShowForgotMsg] = useState(false)

  const days = [
    { label: 'Mon', num: 13, active: false, status: 'Submitted' },
    { label: 'Tue', num: 14, active: false, status: 'Submitted' },
    { label: 'Wed', num: 15, active: true, status: 'Today' },
    { label: 'Thu', num: 16, active: false, status: 'Upcoming' },
    { label: 'Fri', num: 17, active: false, status: 'Upcoming' },
    { label: 'Sat', num: 18, active: false, status: 'Upcoming' }
  ]

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return

    setLoading(true)
    setMessage(null)

    const supabase = getClient()

    let loginEmail = username.trim()

    if (!isMock && !loginEmail.includes('@')) {
      try {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', loginEmail)
          .maybeSingle()
        
        if (profileRow?.email) {
          loginEmail = profileRow.email
        } else {
          loginEmail = `${loginEmail}@dtce.internal`
        }
      } catch (err) {
        loginEmail = `${loginEmail}@dtce.internal`
      }
    } else if (isMock && !loginEmail.includes('@')) {
      loginEmail = `${loginEmail}@dtce.internal`
    }

    if (isMock) {
      const { data, error } = await (supabase.auth as any).signInWithPassword({
        email: loginEmail,
        password
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
        setLoading(false)
        return
      }

      setMessage({ type: 'success', text: 'Credentials verified. Signing you in...' })

      // Set the auth cookie directly so the Edge middleware can read it on the next request
      document.cookie = `sb-mock-token=${data.user.id}; path=/; max-age=86400; SameSite=Lax`

      // Load profile to determine destination
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      setTimeout(() => {
        if (prof?.must_change_password) {
          window.location.href = '/reset-password'
        } else {
          const role = prof?.role
          const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
          window.location.href = path  // Hard navigate forces fresh server request with cookie
        }
      }, 600)

    } else {
      // Live Supabase email/password login
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password
        })

        if (error) {
          console.error('Supabase Auth Error:', error)
          let errorText = error.message
          if (!errorText || errorText === '{}' || (typeof error === 'object' && Object.keys(error).length === 0)) {
            errorText = 'Invalid username or password. Please verify your credentials and database connection.'
          }
          setMessage({ type: 'error', text: errorText })
          setLoading(false)
          return
        }

        if (data?.user) {
          const { data: prof, error: dbErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single()

          if (dbErr) {
            console.error('Database Profile Read Error:', dbErr)
            setMessage({ type: 'error', text: `Authentication succeeded, but failed to load user profile: ${dbErr.message}` })
            setLoading(false)
            return
          }

          if (prof?.must_change_password) {
            router.push('/reset-password')
          } else {
            const role = prof?.role
            const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
            router.push(path)
            router.refresh()
          }
        } else {
          setMessage({ type: 'error', text: 'Authentication failed. No user session returned.' })
          setLoading(false)
        }
      } catch (err: any) {
        console.error('Login Exception:', err)
        setMessage({ type: 'error', text: err.message || String(err) || 'An unexpected error occurred during login.' })
        setLoading(false)
      }
    }
  }

  const handleQuickLogin = async (mockUsername: string) => {
    setLoading(true)
    setMessage({ type: 'success', text: `Signing in as ${mockUsername}...` })

    // Map usernames to their static mock profile IDs so the middleware can validate
    const usernameToId: Record<string, string> = {
      'admin.secretariat': 'user-admin',
      'jane.coordinator': 'user-coord',
      'smith.medical': 'user-hod-med',
      'kelly.medical': 'user-asst-med',
      'robert.registration': 'user-hod-reg',
      'john.ushering': 'user-hod-ush',
      'mary.welfare': 'user-hod-wel',
    }
    const usernameToRole: Record<string, string> = {
      'admin.secretariat': 'super_admin',
      'jane.coordinator': 'coordinator',
      'smith.medical': 'hod',
      'kelly.medical': 'assistant',
      'robert.registration': 'hod',
      'john.ushering': 'hod',
      'mary.welfare': 'hod',
    }
    const usernameToName: Record<string, string> = {
      'admin.secretariat': 'Admin Chief',
      'jane.coordinator': 'Coordinator Jane',
      'smith.medical': 'Dr. Smith (HOD)',
      'kelly.medical': 'Nurse Kelly (Asst)',
      'robert.registration': 'Elder Robert (Registration)',
      'john.ushering': 'Deacon John (Ushering)',
      'mary.welfare': 'Sister Mary (Welfare)',
    }

    const profileId = usernameToId[mockUsername]
    if (!profileId) {
      setMessage({ type: 'error', text: 'Unknown quick login user.' })
      setLoading(false)
      return
    }

    // Set the auth cookie BEFORE redirecting so middleware can read it immediately
    document.cookie = `sb-mock-token=${profileId}; path=/; max-age=86400; SameSite=Lax`

    setMessage({ type: 'success', text: `Logging in as ${usernameToName[mockUsername]}...` })

    setTimeout(() => {
      const role = usernameToRole[mockUsername]
      const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
      window.location.href = path  // Hard navigate to force fresh server request with cookie
    }, 600)
  }

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ background: '#06090F' }}
    >
      {/* ── Left Panel: Cinematic Brand Side ── */}
      <div
        className="relative hidden lg:flex w-5/12 flex-col justify-between overflow-hidden p-12"
        style={{
          background: 'linear-gradient(160deg, #0C1220 0%, #06090F 50%, #0A1628 100%)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Ambient glow orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-10%] left-[-10%] h-96 w-96 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #1E40AF 0%, transparent 70%)' }} />
          <div className="absolute bottom-[-5%] right-[-5%] h-80 w-80 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }} />
        </div>

        {/* Logo & tagline */}
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">DTCE Oversight System</div>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white leading-tight">
            Daily Report<br />
            <span className="text-gradient-gold">Portal</span>
          </h1>
          <p className="mt-3 text-[13px] text-slate-500 leading-relaxed max-w-xs">
            Secure departmental reporting tools for convention operations.
          </p>
        </div>

        {/* Day Rail */}
        <div className="relative z-10 space-y-2">
          <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase mb-3">Convention Schedule</p>
          {days.map((day) => (
            <div
              key={day.num}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-300"
              style={
                day.active
                  ? { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              <div className="flex items-center gap-3">
                {day.active && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 pulse-dot" />}
                <span className="font-tabular text-sm font-bold" style={{ color: day.active ? '#FCD34D' : '#475569' }}>
                  {day.num.toString().padStart(2, '0')}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: day.active ? '#F1F5F9' : '#475569' }}>
                  {day.label}
                </span>
              </div>
              <span
                className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                style={
                  day.active
                    ? { background: 'rgba(245,158,11,0.2)', color: '#FCD34D' }
                    : day.status === 'Submitted'
                    ? { background: 'rgba(16,185,129,0.1)', color: '#34D399' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#334155' }
                }
              >
                {day.status}
              </span>
            </div>
          ))}
        </div>

        <div className="relative z-10 text-[10px] font-mono text-slate-700 uppercase tracking-widest">
          RCCG Teens &amp; Children Directorate
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-sm space-y-5 animate-fade-in-up">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span className="text-sm font-bold text-white">DTCE Reporting</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">Sign In</h2>
            <p className="text-[13px] text-slate-500 mt-1">Enter your provisioned credentials to continue.</p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'rgba(12, 18, 32, 0.9)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Username
                </label>
                <input
                  id="username"
                  placeholder="e.g. admin.secretariat"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  className="input-dark"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotMsg(true)}
                    className="text-[11px] font-medium transition-colors"
                    style={{ color: '#F59E0B' }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="input-dark"
                />
              </div>

              {showForgotMsg && (
                <div className="rounded-xl p-3 text-[12px]" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#FCD34D' }}>
                  Contact your Department Head or Secretariat Admin to reset your password.
                </div>
              )}

              {message && (
                <div
                  className="rounded-xl p-3 text-[12px]"
                  style={
                    message.type === 'success'
                      ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34D399' }
                      : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }
                  }
                >
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 text-[14px] font-bold text-white transition-all duration-200"
                style={{
                  background: loading ? 'rgba(30,64,175,0.5)' : 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                  border: '1px solid rgba(59,130,246,0.3)',
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                {loading ? 'Authenticating…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
