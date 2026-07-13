'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock } from '@/utils/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { store } from '@/utils/supabase/mockClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setMessage(null)

    const supabase = getClient()

    if (isMock) {
      // Simulate login for mock mode
      const { data, error } = await (supabase.auth as any).signInWithMockUser(email)
      if (error) {
        setMessage({ type: 'error', text: error.message })
        setLoading(false)
        return
      }
      setMessage({ type: 'success', text: 'Logging in as mock user...' })
      setTimeout(() => {
        const role = data.user?.user_metadata?.role
        const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
        router.push(path)
        router.refresh()
      }, 800)
    } else {
      // Live Supabase magic link login
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({ type: 'success', text: 'Check your email for the magic link!' })
      }
      setLoading(false)
    }
  }

  const handleQuickLogin = async (mockEmail: string) => {
    setLoading(true)
    setEmail(mockEmail)
    const supabase = getClient()
    const { data, error } = await (supabase.auth as any).signInWithMockUser(mockEmail)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
      return
    }
    setMessage({ type: 'success', text: `Logging in as ${data.user?.user_metadata?.full_name}...` })
    setTimeout(() => {
      const role = data.user?.user_metadata?.role
      const path = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
      router.push(path)
      router.refresh()
    }, 800)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 font-sans">DTCE Reporting</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in with magic link to access your portal
          </p>
        </div>

        <Card className="border-slate-200 shadow-xl dark:border-slate-800">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your email to receive a passwordless sign-in link</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {message && (
                <div
                  className={`rounded-md p-3 text-sm ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-400'
                      : 'bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-400'
                  }`}
                >
                  {message.text}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending link...' : 'Send Magic Link'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {isMock && (
          <Card className="border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/50">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                🛠️ Local Simulation Mode (Quick Logins)
              </CardTitle>
              <CardDescription className="text-xs">
                Click any role profile below to instantly log in and test redirection:
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs justify-start"
                onClick={() => handleQuickLogin('admin@dtce.org')}
                disabled={loading}
              >
                👑 Super Admin
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs justify-start"
                onClick={() => handleQuickLogin('coordinator@dtce.org')}
                disabled={loading}
              >
                👥 Coordinator
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs justify-start"
                onClick={() => handleQuickLogin('hod@dtce.org')}
                disabled={loading}
              >
                🩺 HOD Medical
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs justify-start"
                onClick={() => handleQuickLogin('reg_hod@dtce.org')}
                disabled={loading}
              >
                📝 HOD Registration
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
