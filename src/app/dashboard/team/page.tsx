'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile } from '@/utils/supabase'
import { DashboardHeader } from '@/components/dashboard-header'
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

export default function SecretariatTeamManagement() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  
  // Single creation form
  const [fullName, setFullName] = useState('')
  const [deptId, setDeptId] = useState('dept-1')
  const [usernameInput, setUsernameInput] = useState('')
  const [role, setRole] = useState<'hod' | 'assistant'>('hod')
  const [savingSingle, setSavingSingle] = useState(false)

  // Bulk creation data
  const [bulkList, setBulkList] = useState<{ id: string; name: string; leaderName: string; email: string }[]>([])
  const [provisioningBulk, setProvisioningBulk] = useState(false)

  // Credential slips to reveal
  const [revealedSlips, setRevealedSlips] = useState<CredentialSlip[]>([])

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
      if (prof.role !== 'super_admin' && prof.role !== 'coordinator') {
        router.push('/my-department')
        return
      }
      setProfile(prof)
    }

    const { data: allUsers } = await supabase.from('profiles').select('*')
    setUsers(allUsers || [])
  }

  useEffect(() => {
    loadData()
    // Initialize bulk list with departments that don't have HODs
    const initialBulk = mockDepartments.map(d => ({
      id: d.id,
      name: d.name,
      leaderName: '',
      email: ''
    }))
    setBulkList(initialBulk)
  }, [])

  // Auto-generate username from full name
  const handleNameChange = (val: string) => {
    setFullName(val)
    const normalized = val
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')
    if (normalized) {
      const dept = mockDepartments.find(d => d.id === deptId)
      const deptSlug = dept ? dept.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '') : 'dept'
      setUsernameInput(`${normalized}.${deptSlug}`)
    } else {
      setUsernameInput('')
    }
  };

  const handleDeptSelectChange = (id: string) => {
    setDeptId(id)
    if (fullName) {
      const normalized = fullName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '.')
        .replace(/[^a-z0-9.]/g, '')
      const dept = mockDepartments.find(d => d.id === id)
      const deptSlug = dept ? dept.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '') : 'dept'
      setUsernameInput(`${normalized}.${deptSlug}`)
    }
  }

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let pass = ''
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pass
  }

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName || !usernameInput) return

    setSavingSingle(true)
    const supabase = getClient()
    const tempPassword = generateRandomPassword()
    const placeholderEmail = `${usernameInput}@dtce.internal`

    try {
      let newUserId = 'mock-user-' + Math.random().toString(36).substr(2, 9)

      if (!isMock) {
        // Sign up user in Supabase Auth
        const { data: signUpData, error: authErr } = await (supabase.auth as any).signUp({
          email: placeholderEmail,
          password: tempPassword,
          options: {
            data: {
              full_name: fullName,
              role: role,
              username: usernameInput,
              must_change_password: true
            }
          }
        })
        if (authErr) throw authErr
        if (signUpData.user) newUserId = signUpData.user.id
      } else {
        // Simulate trigger insertion
        const newProfile = {
          id: newUserId,
          email: placeholderEmail,
          username: usernameInput,
          full_name: fullName,
          role: role,
          department_id: deptId,
          must_change_password: true,
          created_by: profile?.id
        }
        const { store } = require('@/utils/supabase/mockClient')
        store.profiles.push(newProfile)
      }

      // If live and auth signup didn't auto-create profile via trigger (in case trigger fails), manually upsert
      const { error: dbErr } = await supabase
        .from('profiles')
        .upsert({
          id: newUserId,
          email: placeholderEmail,
          username: usernameInput,
          full_name: fullName,
          role: role,
          department_id: deptId,
          must_change_password: true,
          created_by: profile?.id
        })

      if (dbErr) throw dbErr

      const dept = mockDepartments.find(d => d.id === deptId)
      
      // Reveal the credential slip
      setRevealedSlips([{
        fullName,
        departmentName: dept?.name || 'Department',
        username: usernameInput,
        temporaryPassword: tempPassword,
        role: role.toUpperCase()
      }])

      // Reset form
      setFullName('')
      setUsernameInput('')
      loadData()
    } catch (err: any) {
      alert(`Provisioning failed: ${err.message}`)
    } finally {
      setSavingSingle(false)
    }
  }

  const handleProvisionBulk = async () => {
    const listToProvision = bulkList.filter(item => item.leaderName.trim() !== '')
    if (listToProvision.length === 0) {
      alert('Please fill in at least one leader name in the bulk table.')
      return
    }

    setProvisioningBulk(true)
    const supabase = getClient()
    const slips: CredentialSlip[] = []

    try {
      for (const item of listToProvision) {
        const tempPassword = generateRandomPassword()
        const normalized = item.leaderName.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
        const deptSlug = item.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
        const username = `${normalized}.${deptSlug}`
        const emailAddress = item.email || `${username}@dtce.internal`

        let newUserId = 'mock-bulk-' + Math.random().toString(36).substr(2, 9)

        if (!isMock) {
          const { data: signUpData, error: authErr } = await (supabase.auth as any).signUp({
            email: emailAddress,
            password: tempPassword,
            options: {
              data: {
                full_name: item.leaderName,
                role: 'hod',
                username: username,
                must_change_password: true
              }
            }
          })
          if (!authErr && signUpData.user) {
            newUserId = signUpData.user.id
          }
        } else {
          const newProfile = {
            id: newUserId,
            email: emailAddress,
            username: username,
            full_name: item.leaderName,
            role: 'hod' as const,
            department_id: item.id,
            must_change_password: true,
            created_by: profile?.id
          }
          const { store } = require('@/utils/supabase/mockClient')
          store.profiles.push(newProfile)
        }

        await supabase.from('profiles').upsert({
          id: newUserId,
          email: emailAddress,
          username: username,
          full_name: item.leaderName,
          role: 'hod',
          department_id: item.id,
          must_change_password: true,
          created_by: profile?.id
        })

        // Also create default HOD assignments for active event 'event-1'
        await supabase.from('hod_assignments').insert({
          event_id: 'event-1',
          profile_id: newUserId,
          department_id: item.id,
          role_in_event: 'hod'
        })

        slips.push({
          fullName: item.leaderName,
          departmentName: item.name,
          username: username,
          temporaryPassword: tempPassword,
          role: 'HOD'
        })
      }

      setRevealedSlips(slips)
      alert(`Successfully provisioned ${slips.length} HOD accounts! See credential slips below.`)
      
      // Reset inputs
      const resetBulk = mockDepartments.map(d => ({
        id: d.id,
        name: d.name,
        leaderName: '',
        email: ''
      }))
      setBulkList(resetBulk)
      loadData()
    } catch (err: any) {
      alert(`Bulk provisioning failed: ${err.message}`)
    } finally {
      setProvisioningBulk(false)
    }
  }

  const handleBulkNameChange = (idx: number, name: string) => {
    const list = [...bulkList]
    list[idx].leaderName = name
    setBulkList(list)
  }

  const handleBulkEmailChange = (idx: number, email: string) => {
    const list = [...bulkList]
    list[idx].email = email
    setBulkList(list)
  }

  return (
    <div className="min-h-screen bg-mesh" style={{ background: '#06090F' }}>
      <DashboardHeader />

      <div className="border-b" style={{ background: 'rgba(6,9,15,0.7)', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between py-6 px-4 md:px-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Secretariat Command Center</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Leader Account Provisioning</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">Provision HOD and department assistant logins.</p>
          </div>
          <div className="flex items-center">
            <Link href="/dashboard">
              <button
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              >
                ➔ Oversight Dashboard
              </button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
        {/* Credential Slips Display Panel (The issued badges) */}
        {revealedSlips.length > 0 && (
          <div className="rounded-2xl p-6 space-y-6" style={{ background: 'rgba(245,158,11,0.04)', border: '1px dashed rgba(245,158,11,0.25)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>🎫</span> Issued Credential Slips ({revealedSlips.length})
                </h3>
                <p className="text-[12px] text-slate-500 mt-1">
                  Temporary passwords will expire on their first login. Issue these credentials to HODs.
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="h-8 rounded-lg px-4 text-[12px] font-semibold transition-all text-white self-start sm:self-center"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              >
                Print Slips
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {revealedSlips.map((slip, i) => (
                <div
                  key={i}
                  className="rounded-xl p-5 relative overflow-hidden flex flex-col justify-between"
                  style={{
                    background: 'rgba(12,18,32,0.8)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    pageBreakInside: 'avoid',
                  }}
                >
                  {/* Ledger Tab marker */}
                  <div className="absolute top-0 right-0 h-full w-1.5" style={{ background: 'linear-gradient(180deg, #F59E0B, #D97706)' }}></div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-start pr-4">
                      <div>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">RCCG DTCE System</span>
                        <h4 className="text-base font-bold text-white mt-1 leading-tight">{slip.fullName}</h4>
                      </div>
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' }}>
                        {slip.role}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[12px] pt-3" style={{ borderTop: '1px dashed rgba(255,255,255,0.06)' }}>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-mono">Department</span>
                        <span className="font-semibold text-slate-300">{slip.departmentName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-mono">Portal URL</span>
                        <span className="font-mono text-slate-400">dtce.org/login</span>
                      </div>
                    </div>

                    <div className="rounded-xl p-3.5 grid grid-cols-2 gap-3 text-[12px] font-mono" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <span className="text-slate-500 block text-[8px] uppercase">Username</span>
                        <span className="font-bold text-slate-200">{slip.username}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[8px] uppercase">Temporary Password</span>
                        <span className="font-bold text-amber-400">{slip.temporaryPassword}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-4 leading-tight italic">
                    * Password reset is required on first login.
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setRevealedSlips([])}
                className="text-[12px] font-semibold text-slate-500 hover:text-slate-400 transition-colors"
              >
                Clear Slip View
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Create Single User */}
          <div className="lg:col-span-1">
            <div className="glass-card p-5 space-y-4">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Single Account Provision</h2>
                <p className="text-[12px] text-slate-500">Create a specific HOD or department assistant login.</p>
              </div>

              <form onSubmit={handleCreateSingle} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="single-fullname" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Leader Full Name</label>
                  <input
                    id="single-fullname"
                    value={fullName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Pastor David Adebayo"
                    required
                    className="input-dark"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="single-dept" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Target Department</label>
                  <select
                    id="single-dept"
                    value={deptId}
                    onChange={(e) => handleDeptSelectChange(e.target.value)}
                    className="w-full h-9 rounded-lg px-3 text-[13px] font-medium text-slate-300 cursor-pointer"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      outline: 'none',
                    }}
                  >
                    {mockDepartments.map(d => (
                      <option key={d.id} value={d.id} style={{ background: '#111827' }}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="single-username" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Generated Username</label>
                  <input
                    id="single-username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Auto-suggested username"
                    required
                    className="input-dark font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="single-role" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">System Role</label>
                  <select
                    id="single-role"
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full h-9 rounded-lg px-3 text-[13px] font-medium text-slate-300 cursor-pointer"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      outline: 'none',
                    }}
                  >
                    <option value="hod" style={{ background: '#111827' }}>HOD (Department Head)</option>
                    <option value="assistant" style={{ background: '#111827' }}>Assistant HOD</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={savingSingle}
                  className="w-full rounded-xl py-2.5 text-[13px] font-bold text-white transition-all duration-200 mt-2"
                  style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)', border: '1px solid rgba(59,130,246,0.3)' }}
                >
                  {savingSingle ? 'Provisioning...' : '⚡ Generate Single Credential'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Bulk Provision List */}
          <div className="lg:col-span-2">
            <div className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
              <div className="px-5 py-4 border-b flex items-center justify-between gap-4" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
                <div>
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Bulk HOD Provisioning Grid</h2>
                  <p className="text-[12px] text-slate-500">Provision HOD accounts for departments in a single action.</p>
                </div>
                <button
                  onClick={handleProvisionBulk}
                  disabled={provisioningBulk}
                  className="rounded-lg px-4 h-8 text-[12px] font-semibold text-white transition-all shrink-0"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.25)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.15)' }}
                >
                  {provisioningBulk ? 'Provisioning Grid...' : 'Bulk Provision HODs'}
                </button>
              </div>

              <div className="overflow-y-auto flex-1 scrollbar-hide">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                      <th className="p-3 w-1/3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="p-3 w-1/3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">HOD Full Name</th>
                      <th className="p-3 w-1/3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Optional Real Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {bulkList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-900/10">
                        <td className="p-3 font-semibold text-slate-400">{item.name}</td>
                        <td className="p-2">
                          <input
                            value={item.leaderName}
                            onChange={(e) => handleBulkNameChange(idx, e.target.value)}
                            placeholder="Leader name to provision"
                            className="input-dark h-8 text-[12px] py-0"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={item.email}
                            onChange={(e) => handleBulkEmailChange(idx, e.target.value)}
                            placeholder="Real email (optional)"
                            className="input-dark h-8 text-[12px] py-0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Accounts List */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Active System Accounts ({users.length})</span>
          </div>

          <div className="overflow-x-auto scrollbar-hide text-[12px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Full Name</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Username</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">System Email</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Department</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Role</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {users.map(u => {
                  const dept = mockDepartments.find(d => d.id === u.department_id)
                  return (
                    <tr key={u.id} className="hover:bg-slate-900/10">
                      <td className="p-3 font-semibold text-slate-200">{u.full_name}</td>
                      <td className="p-3 font-mono text-slate-400">{u.username || '—'}</td>
                      <td className="p-3 text-slate-500">{u.email}</td>
                      <td className="p-3 font-medium text-slate-400">{dept?.name || 'Administrative Office'}</td>
                      <td className="p-3">
                        <span
                          className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                          style={
                            u.role === 'super_admin' ? { background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' } :
                            u.role === 'coordinator' ? { background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' } :
                            u.role === 'hod' ? { background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' } :
                            { background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }
                          }
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3">
                        {u.must_change_password ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}>
                            Pending Reset
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

