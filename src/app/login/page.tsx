'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getClient, isMock } from '@/utils/supabase'
import { AuthInput } from '@/components/ui/auth-input'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ArrowLeft, ClipboardCheck, Package, WifiOff } from 'lucide-react'

const WORKSPACE_PILLARS = [
  {
    icon: ClipboardCheck,
    title: 'Daily Reports',
    desc: 'Submit attendance, collections, and daily updates for your department.',
  },
  {
    icon: Package,
    title: 'Supply Requests',
    desc: 'Send pre-event needs lists and request items from the store.',
  },
  {
    icon: WifiOff,
    title: 'Works Offline',
    desc: 'Save drafts on any device and sync automatically when online.',
  },
] as const

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
        const res = await fetch('/api/resolve-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: loginEmail })
        })
        const resolved = await res.json()
        loginEmail = resolved?.email || `${loginEmail}@accounts.dtcereports.vercel.app`
      } catch {
        loginEmail = `${loginEmail}@accounts.dtcereports.vercel.app`
      }
    } else if (isMock && !loginEmail.includes('@')) {
      loginEmail = `${loginEmail}@accounts.dtcereports.vercel.app`
    }

    if (isMock) {
      const { data, error } = await (supabase.auth as any).signInWithPassword({
        email: loginEmail,
        password,
      })

      if (error) {
        const errorText = error.message?.toLowerCase().includes('failed to fetch') || error.message?.toLowerCase().includes('fetch failed') || !navigator.onLine
          ? 'Check your internet connection and try again.'
          : error.message
        setFormMessage({ type: 'error', text: errorText })
        setLoading(false)
        return
      }

      setFormMessage({ type: 'success', text: 'Credentials verified. Signing you in…' })
      document.cookie = `sb-mock-token=${data.user.id}; path=/; max-age=86400; SameSite=Lax`

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle()

      if (prof && prof.is_active === false) {
        document.cookie = 'sb-mock-token=; path=/; max-age=0'
        setFormMessage({
          type: 'error',
          text: 'This account has been deactivated. Please contact your HOD or Secretariat.'
        })
        setLoading(false)
        return
      }

      setTimeout(() => {
        const meta = (data.user.user_metadata || {}) as any
        const activeRole = prof?.role || meta.role || 'hod'
        const mustChangePassword = prof ? prof.must_change_password : !!meta.must_change_password
        // Signal to the notification prompt whether to wait for password reset
        localStorage.setItem('dtce_must_change_password', mustChangePassword ? 'true' : 'false')
        if (mustChangePassword) {
          window.location.href = '/reset-password'
        } else {
          const isAdmin = activeRole === 'super_admin' || activeRole === 'coordinator' || activeRole === 'national_coordinator'
          const path = isAdmin ? '/dashboard' : '/my-department'
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
          } else if (errorText.toLowerCase().includes('failed to fetch') || errorText.toLowerCase().includes('fetch failed') || !navigator.onLine) {
            errorText = 'Check your internet connection and try again.'
          }
          setFormMessage({ type: 'error', text: errorText })
          setLoading(false)
          return
        }

        if (data?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle()

          if (prof && prof.is_active === false) {
            await supabase.auth.signOut()
            setFormMessage({
              type: 'error',
              text: 'This account has been deactivated. Please contact your HOD or Secretariat.'
            })
            setLoading(false)
            return
          }

          const meta = (data.user.user_metadata || {}) as any
          const activeRole = prof?.role || meta.role || 'hod'
          const mustChangePassword = prof ? prof.must_change_password : !!meta.must_change_password
          // Signal to the notification prompt whether to wait for password reset
          localStorage.setItem('dtce_must_change_password', mustChangePassword ? 'true' : 'false')

          if (mustChangePassword) {
            router.push('/reset-password')
          } else {
            const isAdmin = activeRole === 'super_admin' || activeRole === 'coordinator' || activeRole === 'national_coordinator'
            const path = isAdmin ? '/dashboard' : '/my-department'
            router.push(path)
            router.refresh()
          }
        } else {
          setFormMessage({ type: 'error', text: 'Authentication failed. No user session returned.' })
          setLoading(false)
        }
      } catch (err: any) {
        console.error('Login Exception:', err)
        const errText = err?.message?.toLowerCase().includes('failed to fetch') || err?.message?.toLowerCase().includes('fetch failed') || !navigator.onLine
          ? 'Check your internet connection and try again.'
          : (err.message || 'An unexpected error occurred during login.')
        setFormMessage({ type: 'error', text: errText })
        setLoading(false)
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-foreground font-sans antialiased">
      {/* ── Left Panel: Architectural Brand Side (desktop only, theme-aware) ── */}
      <aside className="relative hidden lg:flex w-5/12 flex-col justify-between overflow-hidden p-12 border-r border-border bg-[#0F2A4A] text-white dark:bg-[#090E18]">
        {/* Fine dot-matrix texture + subtle ambient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute top-[-10%] left-[-10%] h-96 w-96 rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, #1E40AF 0%, transparent 70%)' }}
          />
          <div
            className="absolute bottom-[-5%] right-[-5%] h-80 w-80 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }}
          />
        </div>

        {/* Logo & tagline */}
        <div className="relative z-10 space-y-6">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="flex-shrink-0 h-12 w-12 rounded-2xl overflow-hidden bg-white p-1.5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="DTCE Reporting Crest"
                width={48}
                height={48}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block">
                DTCE Reporting
              </span>
              <span className="text-xs text-slate-300 block">
                Departmental Reporting Portal
              </span>
            </div>
          </Link>

          <div className="space-y-3 pt-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
              Sign in to{' '}
              <span className="text-amber-400">
                your portal.
              </span>
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-sm">
              Enter your assigned username and password to get started.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Portal Overview
            </Link>
          </div>
        </div>

        {/* Workspace Pillars */}
        <div className="relative z-10 space-y-3">
          {WORKSPACE_PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <div
                key={pillar.title}
                className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/[0.06] backdrop-blur-xs p-3.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-400/25">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block">
                    {pillar.title}
                  </span>
                  <span className="text-[11px] text-slate-300 leading-snug block mt-0.5">
                    {pillar.desc}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="relative z-10 text-xs text-slate-400">
          RCCG Directorate of Teens &amp; Children Education
        </div>
      </aside>

      {/* ── Right Panel: Login Form ── */}
      <main className="relative flex flex-1 flex-col bg-background overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-dot-matrix [mask-image:radial-gradient(ellipse_75%_65%_at_50%_40%,#000_35%,transparent_100%)]"
        />
        {/* Mobile & Tablet header bar */}
        <div className="relative z-10 flex lg:hidden items-center justify-between gap-2 px-4 sm:px-6 py-3.5 border-b border-border bg-background/90 backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="flex-shrink-0 h-9 w-9 rounded-xl overflow-hidden bg-white p-1 border border-border shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="DTCE Reporting Crest"
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-sm font-bold text-foreground truncate">
              DTCE Reporting
            </span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
            >
              Overview
            </Link>
            <ThemeToggle compact />
          </div>
        </div>

        {/* Form area */}
        <div className="relative z-10 flex flex-1 items-center justify-center p-6 lg:p-16">
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

            {/* Form card (Ramp Elevation System) */}
            <div
              className="rounded-2xl p-6 sm:p-7 space-y-4 bg-card border border-border shadow-[0_1px_2px_rgba(15,42,74,0.05),0_12px_32px_-6px_rgba(15,42,74,0.09)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
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
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>


                {showForgotMsg && (
                  <div
                    className="rounded-xl p-3 text-[12px] bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300"
                    role="status"
                  >
                    Contact your Department Head or Secretariat Admin to reset your password.
                  </div>
                )}

                {formMessage && (
                  <div
                    className={`rounded-xl p-3 text-[12px] border ${
                      formMessage.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300'
                    }`}
                    role="alert"
                  >
                    {formMessage.text}
                  </div>
                )}

                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl py-3 text-[14px] font-bold bg-[#0F2A4A] hover:bg-[#163861] text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-[#06090F] shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-60"
                >
                  {loading ? 'Authenticating…' : 'Sign In'}
                </button>
              </form>
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-muted-foreground">
              RCCG Directorate of Teens &amp; Children Education
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
