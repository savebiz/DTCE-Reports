'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile } from '@/utils/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

interface CredentialSlip {
  fullName: string
  departmentName: string
  username: string
  temporaryPassword: string
  role: string
}

export default function HODTeamManagement() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [departmentName, setDepartmentName] = useState('Department')
  const [assistants, setAssistants] = useState<Profile[]>([])
  
  // Assistant creation state
  const [fullName, setFullName] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [issuedSlip, setIssuedSlip] = useState<CredentialSlip | null>(null)

  const loadData = async () => {
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
      if (prof.role !== 'hod') {
        router.push('/dashboard')
        return
      }
      setProfile(prof)

      const dept = mockDepartments.find(d => d.id === prof.department_id)
      setDepartmentName(dept?.name || 'Department')

      // Load assistants scoped specifically to this department
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('*')
        .eq('department_id', prof.department_id)
        .eq('role', 'assistant')
      
      setAssistants(allUsers || [])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleNameChange = (val: string) => {
    setFullName(val)
    const normalized = val
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')
    if (normalized && profile) {
      const dept = mockDepartments.find(d => d.id === profile.department_id)
      const deptSlug = dept ? dept.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '') : 'dept'
      setUsernameInput(`${normalized}.asst.${deptSlug}`)
    } else {
      setUsernameInput('')
    }
  }

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$'
    let pass = ''
    for (let i = 8; i > 0; --i) pass += chars[Math.floor(Math.random() * chars.length)]
    return pass
  }

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName || !usernameInput || !profile) return

    setSaving(true)
    const supabase = getClient()
    const tempPassword = generateRandomPassword()
    const placeholderEmail = `${usernameInput}@dtce.internal`

    try {
      let newUserId = 'mock-asst-' + Math.random().toString(36).substr(2, 9)

      if (!isMock) {
        const { data: signUpData, error: authErr } = await (supabase.auth as any).signUp({
          email: placeholderEmail,
          password: tempPassword,
          options: {
            data: {
              full_name: fullName,
              role: 'assistant',
              username: usernameInput,
              must_change_password: true
            }
          }
        })
        if (authErr) throw authErr
        if (signUpData.user) newUserId = signUpData.user.id
      } else {
        const newProfile = {
          id: newUserId,
          email: placeholderEmail,
          username: usernameInput,
          full_name: fullName,
          role: 'assistant' as const,
          department_id: profile.department_id,
          must_change_password: true,
          created_by: profile.id,
          is_active: true
        }
        const { store } = require('@/utils/supabase/mockClient')
        store.profiles.push(newProfile)
      }

      await supabase.from('profiles').upsert({
        id: newUserId,
        email: placeholderEmail,
        username: usernameInput,
        full_name: fullName,
        role: 'assistant',
        department_id: profile.department_id,
        must_change_password: true,
        created_by: profile.id,
        is_active: true
      })

      // Auto-assign assistant to active event
      await supabase.from('hod_assignments').insert({
        event_id: 'event-1',
        profile_id: newUserId,
        department_id: profile.department_id,
        role_in_event: 'assistant'
      })

      setIssuedSlip({
        fullName,
        departmentName,
        username: usernameInput,
        temporaryPassword: tempPassword,
        role: 'ASSISTANT HOD'
      })

      setFullName('')
      setUsernameInput('')
      loadData()
    } catch (err: any) {
      alert(`Assistant creation failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleAssistantActive = async (asstId: string, currentStatus: boolean) => {
    const supabase = getClient()
    try {
      if (isMock) {
        const { store } = require('@/utils/supabase/mockClient')
        const match = store.profiles.find((p: any) => p.id === asstId)
        if (match) match.is_active = !currentStatus
      }
      
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', asstId)

      if (error) throw error
      alert(`Account status updated successfully.`)
      loadData()
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-charcoal">
        <p className="text-sm font-mono animate-pulse">Loading Team Dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-charcoal font-sans">
      {/* Header bar */}
      <header className="flex h-14 items-center justify-between border-b border-hairline bg-white px-6">
        <div className="flex items-center space-x-6">
          <span className="text-sm font-display font-bold text-ink-navy flex items-center space-x-1.5">
            <span>⛪</span>
            <span>{departmentName} Team</span>
          </span>
          <nav className="flex space-x-4 text-xs font-semibold text-slate-500">
            <Link href="/my-department" className="hover:text-ink-navy">Dashboard Checklist</Link>
            <Link href="/my-department/narrative" className="hover:text-ink-navy">Narrative Write-up</Link>
            <Link href="/my-department/team" className="text-ink-navy border-b-2 border-convention-gold pb-0.5">Manage Team</Link>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <Link href="/my-department">
            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold border-hairline text-slate-700">
              ➔ Back to Checklist
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink-navy">Manage My Team</h1>
          <p className="text-xs text-slate-500">
            HOD Controls • Scoped to {departmentName} department assistants.
          </p>
        </div>

        {/* Issued Credential Slip */}
        {issuedSlip && (
          <Card className="border-2 border-dashed border-convention-gold bg-amber-50/20 p-5 space-y-4 max-w-md">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-convention-gold">
                🎫 Issued Assistant Credential Slip
              </span>
              <Button size="xs" variant="ghost" onClick={() => setIssuedSlip(null)} className="text-[10px]">
                Dismiss
              </Button>
            </div>
            <div className="bg-white border border-hairline p-5 rounded relative overflow-hidden">
              <div className="absolute top-0 right-0 h-full w-2 bg-convention-gold"></div>
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400">RCCG DTCE System</span>
                  <h4 className="text-base font-display font-semibold text-ink-navy">{issuedSlip.fullName}</h4>
                </div>
                <div className="border-t border-dashed border-hairline pt-3 text-xs grid grid-cols-2 gap-1.5 font-mono">
                  <div>
                    <span className="text-slate-400 block text-[8px] uppercase">Username</span>
                    <span className="font-bold text-slate-800">{issuedSlip.username}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px] uppercase">Temporary Password</span>
                    <span className="font-bold text-red-600">{issuedSlip.temporaryPassword}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Assistant form */}
          <div className="lg:col-span-1">
            <Card className="border-hairline bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Provision Assistant HOD
                </CardTitle>
                <CardDescription className="text-xs">
                  Create a new sub-leader login for your department.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateAssistant}>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="asst-name">Assistant Full Name</Label>
                    <Input
                      id="asst-name"
                      value={fullName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Deaconess Funmi Coker"
                      required
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="asst-username">Generated Username</Label>
                    <Input
                      id="asst-username"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Auto-suggests username"
                      required
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={saving} className="w-full bg-ink-navy text-white text-xs h-9">
                    {saving ? 'Creating Account...' : '⚡ Generate Assistant Credential'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          {/* Assistant list */}
          <div className="lg:col-span-2">
            <Card className="border-hairline bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Active Assistant Accounts
                </CardTitle>
                <CardDescription className="text-xs">
                  Review or deactivate helper profiles issued for {departmentName}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 border-t border-hairline">
                {assistants.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-6 text-center">
                    No assistant HOD logins provisioned yet for your department.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-hairline text-slate-600 font-bold">
                        <th className="p-3">Full Name</th>
                        <th className="p-3">Username</th>
                        <th className="p-3">Login Password Reset</th>
                        <th className="p-3">Account Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {assistants.map(asst => (
                        <tr key={asst.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-800">{asst.full_name}</td>
                          <td className="p-3 font-mono text-slate-500">{asst.username}</td>
                          <td className="p-3">
                            {asst.must_change_password ? (
                              <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Pending Reset
                              </span>
                            ) : (
                              <span className="text-[10px] text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                                Active Password
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {asst.is_active !== false ? (
                              <span className="text-[10px] text-emerald-800 font-bold">Active</span>
                            ) : (
                              <span className="text-[10px] text-red-800 font-bold">Deactivated</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => toggleAssistantActive(asst.id, asst.is_active !== false)}
                              className={`text-[10px] font-semibold h-7 ${
                                asst.is_active !== false 
                                  ? 'text-red-600 border-red-200 hover:bg-red-50' 
                                  : 'text-green-600 border-green-200 hover:bg-green-50'
                              }`}
                            >
                              {asst.is_active !== false ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
