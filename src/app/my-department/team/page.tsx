'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
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

    let activeProfile = prof
    if (!activeProfile && user) {
      const meta = user.user_metadata as any
      activeProfile = {
        id: user.id,
        email: user.email || '',
        full_name: meta?.full_name || user.email?.split('@')[0] || 'Department HOD',
        role: meta?.role || 'hod',
        department_id: meta?.department_id || 'dept-10', // Default to Medical
        username: meta?.username || user.email?.split('@')[0] || 'user',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      if (activeProfile.role !== 'hod') {
        router.push('/dashboard')
        return
      }
      setProfile(activeProfile)

      const dept = mockDepartments.find(d => d.id === activeProfile.department_id)
      if (dept) {
        setDepartmentName(dept.name)
      } else {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('name')
          .eq('id', activeProfile.department_id)
          .maybeSingle()
        setDepartmentName(dbDept?.name || 'Department')
      }

      // Load assistants scoped specifically to this department
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('*')
        .eq('department_id', activeProfile.department_id)
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
      .replace(/[^a-zA-Z0-9\s]/g, '') // remove special chars
      .split(/\s+/)
      .filter(p => !['deaconess', 'deacon', 'pastor', 'elder', 'brother', 'sister', 'bro', 'sis', 'dr', 'mr', 'mrs', 'miss'].includes(p))
      .filter(p => p.length > 0)
      .join('.')
    
    if (normalized) {
      setUsernameInput(normalized)
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

    try {
      // 1. Dynamic Username Collision Resolution
      let baseUsername = usernameInput.toLowerCase().trim()
      let finalUsername = baseUsername
      let suffix = 2
      
      while (true) {
        let isCollision = false
        if (isMock) {
          const { store: mockStore } = require('@/utils/supabase/mockClient')
          isCollision = mockStore.profiles.some((p: any) => p.username?.toLowerCase() === finalUsername)
        } else {
          const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', finalUsername)
            .maybeSingle()
          isCollision = !!existing
        }

        if (!isCollision) {
          break
        }
        finalUsername = `${baseUsername}.${suffix}`
        suffix++
      }

      const placeholderEmail = `${finalUsername}@accounts.dtce-reports.vercel.app`
      let newUserId = 'mock-asst-' + Math.random().toString(36).substr(2, 9)

      if (!isMock) {
        const { data: signUpData, error: authErr } = await (supabase.auth as any).signUp({
          email: placeholderEmail,
          password: tempPassword,
          options: {
            data: {
              full_name: fullName,
              role: 'assistant',
              username: finalUsername,
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
          username: finalUsername,
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
        username: finalUsername,
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
      showToast(`Assistant creation failed: ${err.message}`, 'error')
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
      showToast(`Account status updated successfully.`, 'success')
      loadData()
    } catch (err: any) {
      showToast(`Status update failed: ${err.message}`, 'error')
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: '#06090F' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Loading Team Dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mesh" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">HOD Controls</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Manage My Team</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Provision and manage sub-leader accounts issued for the {departmentName} department.
          </p>
        </div>

        {/* Issued Credential Slip */}
        {issuedSlip && (
          <div className="rounded-2xl p-6 space-y-4 max-w-md" style={{ background: 'rgba(245,158,11,0.04)', border: '1px dashed rgba(245,158,11,0.25)' }}>
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-bold uppercase tracking-wider text-amber-400">
                🎫 Issued Assistant Credential Slip
              </span>
              <button
                onClick={() => setIssuedSlip(null)}
                className="text-[12px] text-slate-500 hover:text-slate-400 font-semibold"
              >
                Dismiss
              </button>
            </div>
            
            <div
              className="rounded-xl p-5 relative overflow-hidden"
              style={{
                background: 'rgba(12,18,32,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="absolute top-0 right-0 h-full w-1.5" style={{ background: 'linear-gradient(180deg, #F59E0B, #D97706)' }}></div>
              <div className="space-y-4">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">RCCG DTCE System</span>
                  <h4 className="text-base font-bold text-white mt-1 leading-tight">{issuedSlip.fullName}</h4>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[12px] pt-3 font-mono" style={{ borderTop: '1px dashed rgba(255,255,255,0.06)' }}>
                  <div>
                    <span className="text-slate-500 block text-[8px] uppercase">Username</span>
                    <span className="font-bold text-slate-200">{issuedSlip.username}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px] uppercase">Temporary Password</span>
                    <span className="font-bold text-amber-400">{issuedSlip.temporaryPassword}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Assistant form */}
          <div className="lg:col-span-1">
            <div className="glass-card p-5 space-y-4">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Provision Assistant HOD</h2>
                <p className="text-[12px] text-slate-500">Create a new sub-leader login for your department.</p>
              </div>

              <form onSubmit={handleCreateAssistant} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="asst-name" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Assistant Full Name</label>
                  <input
                    id="asst-name"
                    value={fullName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Deaconess Funmi Coker"
                    required
                    className="input-dark"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="asst-username" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Generated Username</label>
                  <input
                    id="asst-username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Auto-suggests username"
                    required
                    className="input-dark font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl py-2.5 text-[13px] font-bold text-white transition-all duration-200 mt-2"
                  style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)', border: '1px solid rgba(59,130,246,0.3)' }}
                >
                  {saving ? 'Creating Account...' : '⚡ Generate Assistant Credential'}
                </button>
              </form>
            </div>
          </div>

          {/* Assistant list */}
          <div className="lg:col-span-2">
            <div className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
              <div className="px-5 py-4 border-b flex flex-col gap-1" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Active Assistant Accounts</span>
                <p className="text-[12px] text-slate-500">Review or deactivate helper profiles issued for {departmentName}.</p>
              </div>

              <div className="overflow-y-auto flex-1 scrollbar-hide">
                {assistants.length === 0 ? (
                  <p className="text-[12px] text-slate-500 italic p-6 text-center">
                    No assistant HOD logins provisioned yet for your department.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                        <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Full Name</th>
                        <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Username</th>
                        <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Login Status</th>
                        <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Account Status</th>
                        <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {assistants.map(asst => (
                        <tr key={asst.id} className="hover:bg-slate-900/10">
                          <td className="p-3 font-semibold text-slate-200">{asst.full_name}</td>
                          <td className="p-3 font-mono text-slate-400">{asst.username}</td>
                          <td className="p-3">
                            {asst.must_change_password ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}>
                                Pending Reset
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                                Active
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {asst.is_active !== false ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>Active</span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.2)' }}>Deactivated</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => toggleAssistantActive(asst.id, asst.is_active !== false)}
                              className="h-7 rounded-lg px-3 text-[11px] font-semibold transition-all duration-150"
                              style={
                                asst.is_active !== false 
                                  ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' } 
                                  : { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34D399' }
                              }
                            >
                              {asst.is_active !== false ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

