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

    // Map username to mock or Supabase credentials
    // If it's a username without an @, construct placeholder email: {username}@dtce.internal
    const loginEmail = username.includes('@') ? username : `${username}@dtce.internal`

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

      setMessage({ type: 'success', text: 'Credentials verified. Checking account status...' })
      
      // Load user profile to check must_change_password
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      setTimeout(() => {
        if (prof?.must_change_password) {
          router.push('/reset-password')
        } else {
          const role = prof?.role
          const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
          router.push(path)
          router.refresh()
        }
      }, 800)
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
    setUsername(mockUsername)
    setPassword('temporaryPass123') // Default mock password
    const loginEmail = `${mockUsername}@dtce.internal`
    const supabase = getClient()

    const { data, error } = await (supabase.auth as any).signInWithPassword({
      email: loginEmail,
      password: 'temporaryPass123'
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    setMessage({ type: 'success', text: `Logging in as ${prof?.full_name || mockUsername}...` })

    setTimeout(() => {
      if (prof?.must_change_password) {
        router.push('/reset-password')
      } else {
        const role = prof?.role
        const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
        router.push(path)
        router.refresh()
      }
    }, 800)
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-paper text-charcoal font-sans">
      {/* Left Panel: Ink-navy with the signature Day Rail */}
      <div className="w-full lg:w-5/12 bg-ink-navy text-white p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-hairline">
        <div>
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 bg-convention-gold rounded-full"></span>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">DTCE Oversight System</span>
          </div>
          <h2 className="text-2xl font-display font-semibold mt-4 text-white">
            Daily Report Portal
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Access secure departmental reporting tools for the active convention.
          </p>
        </div>

        {/* Signature Day Rail Tab Rail */}
        <div className="my-10 space-y-2.5 max-w-sm">
          {days.map((day) => (
            <div
              key={day.num}
              className={`flex items-center justify-between p-3 rounded border transition-all duration-300 ${
                day.active
                  ? 'bg-convention-gold border-convention-gold text-ink-navy font-bold shadow-md'
                  : 'bg-ink-navy/40 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-3 text-xs">
                <span className="font-mono text-sm font-bold">
                  {day.num.toString().padStart(2, '0')}
                </span>
                <span className="font-semibold uppercase tracking-wider">{day.label}</span>
              </div>
              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                day.active ? 'bg-ink-navy/20 text-ink-navy' : 'bg-slate-900 text-slate-500'
              }`}>
                {day.status}
              </span>
            </div>
          ))}
        </div>

        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
          ⛪ RCCG Teens & Children Directorate
        </div>
      </div>

      {/* Right Panel: Login Credentials Form */}
      <div className="w-full lg:w-7/12 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          <div className="text-left space-y-1">
            <h1 className="text-3xl font-display font-semibold text-ink-navy">Sign In</h1>
            <p className="text-sm text-slate-500">
              Enter your pre-provisioned leader username and password.
            </p>
          </div>

          <Card className="border-hairline shadow-md bg-white">
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-xs font-semibold text-slate-600">Username</Label>
                  <Input
                    id="username"
                    placeholder="e.g. smith.medical"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 text-sm font-sans"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password" className="text-xs font-semibold text-slate-600">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotMsg(true)}
                      className="text-xs font-medium text-convention-gold hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 text-sm font-sans"
                  />
                </div>

                {showForgotMsg && (
                  <div className="rounded-md bg-amber-50 text-amber-800 border border-amber-200/60 p-3 text-xs">
                    🔒 Self-service password resets are disabled. Please contact your Department Head or the Secretariat Admin to reset your temporary password.
                  </div>
                )}

                {message && (
                  <div
                    className={`rounded-md p-3 text-sm ${
                      message.type === 'success'
                        ? 'bg-green-50 text-green-800 border border-green-100'
                        : 'bg-red-50 text-red-800 border border-red-100'
                    }`}
                  >
                    {message.text}
                  </div>
                )}
              </CardContent>
              <CardFooter className="pb-6">
                <Button type="submit" className="w-full bg-ink-navy text-white hover:bg-ink-navy/95 font-semibold h-10" disabled={loading}>
                  {loading ? 'Authenticating...' : 'Sign In'}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {isMock && (
            <Card className="border-dashed border-hairline bg-slate-50/50 p-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
                🛠️ Quick Leader Logins (No password needed)
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs justify-start h-8 text-slate-700 font-semibold border-hairline"
                  onClick={() => handleQuickLogin('admin.secretariat')}
                  disabled={loading}
                >
                  👑 Admin Chief
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs justify-start h-8 text-slate-700 font-semibold border-hairline"
                  onClick={() => handleQuickLogin('jane.coordinator')}
                  disabled={loading}
                >
                  👥 Coordinator
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs justify-start h-8 text-slate-700 font-semibold border-hairline"
                  onClick={() => handleQuickLogin('smith.medical')}
                  disabled={loading}
                >
                  🩺 HOD Medical
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs justify-start h-8 text-slate-700 font-semibold border-hairline"
                  onClick={() => handleQuickLogin('robert.registration')}
                  disabled={loading}
                >
                  📝 HOD Registry
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
