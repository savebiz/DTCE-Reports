'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (prof) {
        setProfile(prof)
        // If they don't actually need to reset, redirect them away
        if (!prof.must_change_password) {
          const path = (prof.role === 'super_admin' || prof.role === 'coordinator') ? '/dashboard' : '/my-department'
          router.push(path)
        }
      } else {
        router.push('/login')
      }
    }
    checkUser()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !confirmPassword) return

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError(null)
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
        .eq('id', profile!.id)

      if (dbErr) throw dbErr

      alert('Password updated successfully! Welcome to DTCE Reporting.')
      const path = (profile!.role === 'super_admin' || profile!.role === 'coordinator') ? '/dashboard' : '/my-department'
      router.push(path)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating your password.')
    } finally {
      setLoading(false)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-charcoal">
        <p className="text-sm font-mono animate-pulse">Checking credentials...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper text-charcoal p-4 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-block text-2xl">🔒</div>
          <h1 className="text-2xl font-display font-semibold text-ink-navy">Secure Your Account</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            This is your first login with an admin-provisioned credential. You must set a personalized password to continue.
          </p>
        </div>

        <Card className="border-hairline shadow-md bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">Update Password</CardTitle>
            <CardDescription className="text-xs">Logged in as {profile.full_name} ({profile.username})</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 text-red-800 border border-red-100 p-3 text-xs font-semibold">
                  ⚠️ {error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-ink-navy text-white hover:bg-ink-navy/95 font-semibold" disabled={loading}>
                {loading ? 'Updating Password...' : '➔ Save Password & Continue'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
