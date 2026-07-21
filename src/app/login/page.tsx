'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock } from '@/utils/supabase'
import { AuthInput } from '@/components/ui/auth-input'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ScheduleDayCard } from '@/components/ui/schedule-day-card'
import type { DayStatus } from '@/components/ui/schedule-day-card'

// ── Convention schedule (decorative, matches real event days) ───────────────
const days: { label: string; num: number; status: DayStatus; isToday: boolean }[] = [
  { label: 'Mon', num: 3, isToday: false, status: 'submitted' },
  { label: 'Tue', num: 4, isToday: false, status: 'submitted' },
  { label: 'Wed', num: 5, isToday: true,  status: 'today'     },
  { label: 'Thu', num: 6, isToday: false, status: 'upcoming'  },
  { label: 'Fri', num: 7, isToday: false, status: 'upcoming'  },
  { label: 'Sat', num: 8, isToday: false, status: 'upcoming'  },
]

// ── Field-level validation ──────────────────────────────────────────────────
function validateFields(username: string, password: string) {
  const errors: { username?: string; password?: string } = {}
  if (!username.trim()) errors.username = 'Username is required.'
  else if (username.trim().length < 3) errors.username = 'Enter at least 3 characters.'
  if (!password) errors.password = 'Password is required.'
  else if (password.length < 6) errors.password = 'Password must be at least 6 characters.'
  return errors
}

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState<{ username: boolean; password: boolean }>({
    username: false,
    password: false,
  })
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showForgotMsg, setShowForgotMsg] = useState(false)

  const fieldErrors = validateFields(username, password)
  const visibleErrors = {
    username: touched.username ? fieldErrors.username : undefined,
    password: touched.password ? fieldErrors.password : undefined,
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Touch all fields to reveal all validation errors
    setTouched({ username: true, password: true })
    if (fieldErrors.username || fieldErrors.password) return

    setLoading(true)
    setFormMessage(null)

    const supabase = getClient()
    let loginEmail = username.trim()

    if (!isMock && !loginEmail.includes('@')) {
      try {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', loginEmail)
          .maybeSingle()
        loginEmail = profileRow?.email ?? `${loginEmail}@accounts.dtce-reports.vercel.app`
      } catch {
        loginEmail = `${loginEmail}@accounts.dtce-reports.vercel.app`
      }
    } else if (isMock && !loginEmail.includes('@')) {
      loginEmail = `${loginEmail}@accounts.dtce-reports.vercel.app`
    }

    if (isMock) {
      const { data, error } = await (supabase.auth as any).signInWithPassword({
        email: loginEmail,
        password,
      })

      if (error) {
        setFormMessage({ type: 'error', text: error.message })
        setLoading(false)
        return
      }

      setFormMessage({ type: 'success', text: 'Credentials verified. Signing you in…' })
      document.cookie = `sb-mock-token=${data.user.id}; path=/; max-age=86400; SameSite=Lax`

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
          window.location.href = path
        }
      }, 600)
    } else {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })

        if (error) {
          console.error('Supabase Auth Error:', error)
          let errorText = error.message
          if (!errorText || errorText === '{}' || (typeof error === 'object' && Object.keys(error).length === 0)) {
            errorText = 'Invalid username or password. Please check your credentials.'
          }
          setFormMessage({ type: 'error', text: errorText })
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
            setFormMessage({ type: 'error', text: `Auth succeeded but profile load failed: ${dbErr.message}` })
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
          setFormMessage({ type: 'error', text: 'Authentication failed. No user session returned.' })
          setLoading(false)
        }
      } catch (err: any) {
        console.error('Login Exception:', err)
        setFormMessage({ type: 'error', text: err.message || 'An unexpected error occurred during login.' })
        setLoading(false)
      }
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ background: 'var(--background)' }}
    >
      {/* ── Left Panel: Cinematic Brand Side (desktop only) ── */}
      <aside
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
          <div className="flex items-center gap-3 mb-8">
            {/* DTCE Logo badge */}
            <div
              className="flex-shrink-0 h-14 w-14 rounded-2xl overflow-hidden"
              style={{
                boxShadow: '0 0 0 1px rgba(245,158,11,0.25), 0 0 20px rgba(245,158,11,0.12)',
                background: '#fff',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="DTCE Junior Church Global"
                width={56}
                height={56}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
                DTCE Oversight System
              </div>
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

        {/* Convention Schedule */}
        <div className="relative z-10 space-y-2">
          <p className="text-[10px] font-bold tracking-widest text-slate-600 uppercase mb-3">
            Convention Schedule
          </p>
          {days.map((day) => (
            <ScheduleDayCard
              key={day.num}
              dayNum={day.num}
              dayLabel={day.label}
              status={day.status}
              isToday={day.isToday}
            />
          ))}
        </div>

        <div className="relative z-10 text-[10px] font-mono text-slate-700 uppercase tracking-widest">
          RCCG Teens &amp; Children Directorate
        </div>
      </aside>

      {/* ── Right Panel: Login Form ── */}
      <main className="flex flex-1 flex-col">
        {/* Mobile header bar */}
        <div
          className="flex lg:hidden items-center justify-between px-5 py-4 border-b"
          style={{
            background: '#06090F',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex-shrink-0 h-9 w-9 rounded-xl overflow-hidden"
              style={{ background: '#fff', boxShadow: '0 0 0 1px rgba(245,158,11,0.2)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="DTCE Junior Church Global"
                width={36}
                height={36}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <span className="text-sm font-bold text-white">DTCE Reporting</span>
          </div>
          <ThemeToggle compact />
        </div>

        {/* Mobile schedule chip rail */}
        <div
          className="flex lg:hidden gap-2 px-5 py-3 overflow-x-auto scrollbar-hide"
          style={{
            background: '#06090F',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {days.map((day) => (
            <div
              key={day.num}
              className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl"
              style={
                day.isToday
                  ? { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              <span
                className="font-tabular text-xs font-bold"
                style={{ color: day.isToday ? '#FCD34D' : '#475569' }}
              >
                {day.num}
              </span>
              <span
                className="text-[9px] font-semibold uppercase tracking-wide"
                style={{ color: day.isToday ? '#F1F5F9' : '#475569' }}
              >
                {day.label}
              </span>
              {day.isToday && (
                <span className="h-1 w-1 rounded-full pulse-dot" style={{ background: '#FBBF24' }} />
              )}
            </div>
          ))}
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-16"
          style={{ background: 'var(--background)' }}
        >
          <div className="w-full max-w-sm space-y-5 animate-fade-in-up">

            {/* Desktop: theme toggle + heading row */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                  Sign In
                </h2>
                <p className="text-[13px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Enter your provisioned credentials to continue.
                </p>
              </div>
              <div className="hidden lg:block pt-1">
                <ThemeToggle />
              </div>
            </div>

            {/* Form card */}
            <div
              className="rounded-2xl p-6 space-y-4"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <AuthInput
                  id="username"
                  label="Username"
                  placeholder="e.g. admin.secretariat"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                  error={visibleErrors.username}
                  disabled={loading}
                  autoComplete="username"
                />


                <AuthInput
                  id="password"
                  label="Password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  error={visibleErrors.password}
                  disabled={loading}
                />

                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotMsg(true)}
                    className="text-[11px] font-medium transition-colors"
                    style={{ color: '#F59E0B' }}
                  >
                    Forgot password?
                  </button>
                </div>


                {showForgotMsg && (
                  <div
                    className="rounded-xl p-3 text-[12px]"
                    style={{
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      color: '#FCD34D',
                    }}
                    role="status"
                  >
                    Contact your Department Head or Secretariat Admin to reset your password.
                  </div>
                )}

                {formMessage && (
                  <div
                    className="rounded-xl p-3 text-[12px]"
                    style={
                      formMessage.type === 'success'
                        ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34D399' }
                        : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }
                    }
                    role="alert"
                  >
                    {formMessage.text}
                  </div>
                )}

                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl py-3 text-[14px] font-bold text-white transition-all duration-200"
                  style={{
                    background: loading ? 'rgba(30,64,175,0.5)' : 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Authenticating…' : 'Sign In'}
                </button>
              </form>
            </div>

            {/* Footer note */}
            <p
              className="text-center text-[11px]"
              style={{ color: 'var(--muted-foreground)' }}
            >
              RCCG Teens &amp; Children Directorate · Convention Edition
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
