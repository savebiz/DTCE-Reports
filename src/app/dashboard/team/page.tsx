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
    <div className="min-h-screen bg-paper text-charcoal font-sans">
      <DashboardHeader />

      <div className="bg-white border-b border-hairline py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-display font-semibold text-ink-navy">Leader Account Provisioning</h1>
            <p className="text-xs text-slate-500">Secretariat Command Center • Provision HOD and assistant accounts.</p>
          </div>
          <div className="flex items-center space-x-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="h-9 text-xs">
                ➔ Oversight Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Credential Slips Display Panel (The issued badges) */}
        {revealedSlips.length > 0 && (
          <Card className="border-2 border-dashed border-convention-gold bg-amber-50/20 p-6 space-y-6">
            <div>
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-convention-gold">
                  🎫 Issued Credential Slips ({revealedSlips.length})
                </h3>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-xs">
                  🖨️ Print Slips
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Print these slips and issue them to HODs. Temporary passwords will expire on their first login.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {revealedSlips.map((slip, i) => (
                <div
                  key={i}
                  className="bg-white border border-hairline p-5 rounded relative overflow-hidden flex flex-col justify-between"
                  style={{ pageBreakInside: 'avoid' }}
                >
                  {/* Ledger Tab marker */}
                  <div className="absolute top-0 right-0 h-full w-2 bg-convention-gold"></div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-start pr-4">
                      <div>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400">RCCG DTCE System</span>
                        <h4 className="text-base font-display font-semibold text-ink-navy leading-tight">{slip.fullName}</h4>
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold border border-hairline">
                        {slip.role}
                      </span>
                    </div>

                    <div className="border-t border-dashed border-hairline pt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-mono">Department</span>
                        <span className="font-semibold text-slate-800">{slip.departmentName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-mono">Portal URL</span>
                        <span className="font-mono text-slate-600">dtce.org/login</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-hairline p-3 rounded grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 block text-[8px] uppercase">Username</span>
                        <span className="font-bold text-slate-800">{slip.username}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[8px] uppercase">Temporary Password</span>
                        <span className="font-bold text-red-600">{slip.temporaryPassword}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[9px] text-slate-400 mt-4 leading-tight italic">
                    * You will be forced to change this password immediately upon logging in.
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setRevealedSlips([])} className="text-xs">
                Clear Slip View
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Create Single User */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-hairline shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Single Account Provision
                </CardTitle>
                <CardDescription className="text-xs">
                  Create a specific HOD or department assistant login.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateSingle}>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="single-fullname">Leader Full Name</Label>
                    <Input
                      id="single-fullname"
                      value={fullName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Pastor David Adebayo"
                      required
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="single-dept">Target Department</Label>
                    <select
                      id="single-dept"
                      value={deptId}
                      onChange={(e) => handleDeptSelectChange(e.target.value)}
                      className="w-full h-9 rounded-md border border-hairline bg-white px-3 text-xs"
                    >
                      {mockDepartments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="single-username">Generated Username</Label>
                    <Input
                      id="single-username"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Auto-suggests from name"
                      required
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="single-role">System Role</Label>
                    <select
                      id="single-role"
                      value={role}
                      onChange={(e: any) => setRole(e.target.value)}
                      className="w-full h-9 rounded-md border border-hairline bg-white px-3 text-xs"
                    >
                      <option value="hod">HOD (Department Head)</option>
                      <option value="assistant">Assistant HOD</option>
                    </select>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={savingSingle} className="w-full bg-ink-navy hover:bg-ink-navy/95 text-white text-xs h-9">
                    {savingSingle ? 'Provisioning...' : '⚡ Generate Single Credential'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          {/* Right Column: Bulk Provision List */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-hairline shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Bulk HOD Provisioning Grid
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Quickly provision HOD accounts for all 40 departments in a single action.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleProvisionBulk}
                  disabled={provisioningBulk}
                  className="bg-convention-gold hover:bg-convention-gold/95 text-ink-navy font-bold text-xs h-9"
                >
                  {provisioningBulk ? 'Provisioning Grid...' : '⚡ Bulk Provision HODs'}
                </Button>
              </CardHeader>
              <CardContent className="p-0 border-t border-hairline max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-hairline font-bold text-slate-600">
                      <th className="p-3 w-1/3">Department</th>
                      <th className="p-3 w-1/3">HOD Full Name</th>
                      <th className="p-3 w-1/3">Optional Real Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {bulkList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/40">
                        <td className="p-3 font-semibold text-slate-700">{item.name}</td>
                        <td className="p-2">
                          <Input
                            value={item.leaderName}
                            onChange={(e) => handleBulkNameChange(idx, e.target.value)}
                            placeholder="Type leader name to provision"
                            className="h-8 text-xs bg-white border-hairline"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.email}
                            onChange={(e) => handleBulkEmailChange(idx, e.target.value)}
                            placeholder="Real email (optional)"
                            className="h-8 text-xs bg-white border-hairline"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Existing Accounts List */}
        <Card className="border-hairline shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Active System Accounts ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 border-t border-hairline">
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-hairline text-slate-600 font-bold">
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">System Email</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">First Login Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {users.map(u => {
                    const dept = mockDepartments.find(d => d.id === u.department_id)
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-700">{u.full_name}</td>
                        <td className="p-3 font-mono text-slate-600">{u.username || '—'}</td>
                        <td className="p-3 text-slate-500">{u.email}</td>
                        <td className="p-3 font-semibold text-slate-600">{dept?.name || 'Administrative Office'}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold ${
                            u.role === 'super_admin' ? 'bg-indigo-100 text-indigo-800' :
                            u.role === 'coordinator' ? 'bg-blue-100 text-blue-800' :
                            u.role === 'hod' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3">
                          {u.must_change_password ? (
                            <span className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              Pending Reset
                            </span>
                          ) : (
                            <span className="text-[10px] text-green-700 font-bold bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                              Completed
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
