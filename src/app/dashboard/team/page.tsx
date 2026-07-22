'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile, Department } from '@/utils/supabase'
import { generateCompliantPassword } from '@/lib/password-policy'
import { showToast } from '@/components/ui/toast'
import Link from 'next/link'

interface CredentialSlip {
  fullName: string
  departmentName: string
  username: string
  temporaryPassword: string
  role: string
}

interface BulkRow {
  id: string
  name: string
  leaderName: string
  username: string
  email: string
  isCreated: boolean
}

export default function SecretariatTeamManagement() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  
  // Single creation form
  const [singleFullName, setSingleFullName] = useState('')
  const [singleDeptId, setSingleDeptId] = useState('dept-1')
  const [singleUsernameInput, setSingleUsernameInput] = useState('')
  const [singleRole, setSingleRole] = useState<'hod' | 'assistant' | 'coordinator' | 'super_admin' | 'national_coordinator'>('hod')
  const [singleEmail, setSingleEmail] = useState('')
  const [savingSingle, setSavingSingle] = useState(false)

  // Bulk creation data list (All 40 departments)
  const [bulkList, setBulkList] = useState<BulkRow[]>([])
  const [provisioningBulk, setProvisioningBulk] = useState(false)
  const [provisionProgress, setProvisionProgress] = useState<string | null>(null)

  // Credential slips to reveal (wipeable, never re-fetched)
  const [revealedSlips, setRevealedSlips] = useState<CredentialSlip[]>([])

  // Errors state
  const [collisions, setCollisions] = useState<string[]>([])

  const [dbDepartments, setDbDepartments] = useState<Department[]>([])

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
        full_name: meta?.full_name || user.email?.split('@')[0] || 'Secretariat Admin',
        role: meta?.role || 'super_admin',
        department_id: meta?.department_id,
        username: meta?.username || user.email?.split('@')[0] || 'admin',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      if (activeProfile.role !== 'super_admin' && activeProfile.role !== 'coordinator' && activeProfile.role !== 'national_coordinator') {
        router.push('/my-department')
        return
      }
      setProfile(activeProfile)
      if (activeProfile.role !== 'super_admin') {
        setSingleRole('assistant')
      }
    }

    // Fetch real departments and all users from DB
    const { data: realDepts } = await supabase.from('departments').select('*')
    const fetchedDepts = realDepts || []
    setDbDepartments(fetchedDepts)

    const { data: allUsers, error: usersErr } = await supabase.from('profiles').select('*')
    if (usersErr) {
      console.error('Error fetching profiles:', usersErr)
      showToast(`Notice: Unable to fetch all user profiles (${usersErr.message})`, 'error')
    }
    const activeUsers = allUsers || []
    setUsers(activeUsers)

    // Build the bulk provisioning grid based on mockDepartments
    const grid: BulkRow[] = mockDepartments.map(dept => {
      // Check if HOD account is already created for this department by matching ID or name
      const existingHOD = activeUsers.find((u: Profile) => {
        if (u.role !== 'hod') return false
        if (u.department_id === dept.id) return true
        const userDbDept = fetchedDepts.find((d: any) => d.id === u.department_id)
        return userDbDept && userDbDept.name.toLowerCase().trim() === dept.name.toLowerCase().trim()
      })
      const deptSlug = dept.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
      
      return {
        id: dept.id,
        name: dept.name,
        leaderName: existingHOD ? existingHOD.full_name || '' : '',
        username: existingHOD ? existingHOD.username || `${deptSlug}.hod` : `${deptSlug}.hod`,
        email: existingHOD ? existingHOD.email || '' : '',
        isCreated: !!existingHOD
      }
    })

    setBulkList(grid)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!singleFullName) return
    const normalized = singleFullName.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
    if (!normalized) return
    
    if (singleRole === 'super_admin' || singleRole === 'coordinator' || singleRole === 'national_coordinator') {
      setSingleDeptId('')
      setSingleUsernameInput(normalized)
    } else {
      if (!singleDeptId) setSingleDeptId('dept-1')
      const dept = mockDepartments.find(d => d.id === (singleDeptId || 'dept-1'))
      const deptSlug = dept ? dept.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') : 'dept'
      setSingleUsernameInput(`${normalized}.${deptSlug}`)
    }
  }, [singleRole, singleFullName, singleDeptId])

  // Auto-generate single username slug
  const handleSingleNameChange = (val: string) => {
    setSingleFullName(val)
  }

  const handleSingleDeptSelectChange = (id: string) => {
    setSingleDeptId(id)
  }

  // Handle inline updates in the bulk provisioning list
  const handleBulkNameChange = (idx: number, name: string) => {
    const list = [...bulkList]
    list[idx].leaderName = name
    setBulkList(list)
    validateUsernames(list)
  }

  const handleBulkUsernameChange = (idx: number, usernameVal: string) => {
    const list = [...bulkList]
    list[idx].username = usernameVal.trim().toLowerCase()
    setBulkList(list)
    validateUsernames(list)
  }

  const handleBulkEmailChange = (idx: number, email: string) => {
    const list = [...bulkList]
    list[idx].email = email.trim()
    setBulkList(list)
  }

  // Check for unique username validation (grid collisions + existing database usernames)
  const validateUsernames = (list: BulkRow[]) => {
    const currentCollisions: string[] = []
    const usernameMap: Record<string, number> = {}

    list.forEach(row => {
      // Only validate rows that are not created yet and have a leader assigned
      if (!row.isCreated && row.leaderName.trim().length > 0) {
        const uName = row.username.trim().toLowerCase()
        if (uName) {
          usernameMap[uName] = (usernameMap[uName] || 0) + 1
          if (usernameMap[uName] > 1) {
            currentCollisions.push(`Duplicate username in grid: "${uName}"`)
          }
          // Check collision with database existing usernames
          const isExistDb = users.some((u: Profile) => u.username?.toLowerCase() === uName)
          if (isExistDb) {
            currentCollisions.push(`Username already exists in database: "${uName}"`)
          }
        }
      }
    })

    setCollisions(Array.from(new Set(currentCollisions)))
  }

  // Single account generation
  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!singleFullName || !singleUsernameInput) return

    // Double check collisions
    const isExistDb = users.some((u: Profile) => u.username?.toLowerCase() === singleUsernameInput.toLowerCase())
    if (isExistDb) {
      showToast(`Username "${singleUsernameInput}" already exists. Please choose a different one.`, 'error')
      return
    }

    setSavingSingle(true)
    const supabase = getClient()
    const password = generateCompliantPassword()
    const placeholderEmail = singleEmail || `${singleUsernameInput}@accounts.dtce-reports.vercel.app`

    try {
      if (isMock) {
        const newUserId = 'mock-user-' + Math.random().toString(36).substr(2, 9)
        const newProfile = {
          id: newUserId,
          email: placeholderEmail,
          username: singleUsernameInput,
          full_name: singleFullName,
          role: singleRole,
          department_id: singleDeptId,
          must_change_password: true,
          created_by: profile?.id,
          is_active: true
        }
        const { store: mockStore } = require('@/utils/supabase/mockClient')
        mockStore.profiles.push(newProfile)
        
        mockStore.assignments.push({
          event_id: 'event-1',
          profile_id: newUserId,
          department_id: singleDeptId,
          role_in_event: singleRole
        })

        const dept = mockDepartments.find(d => d.id === singleDeptId)
        setRevealedSlips([{
          fullName: singleFullName,
          departmentName: dept?.name || 'Department',
          username: singleUsernameInput,
          temporaryPassword: password,
          role: singleRole.toUpperCase()
        }])
      } else {
        // Live Mode API Call
        const isAdminRole = singleRole === 'super_admin' || singleRole === 'coordinator' || singleRole === 'national_coordinator'
        // Resolve department name from DB departments first, then mock departments as fallback
        let resolvedDeptName = 'Department'
        if (!isAdminRole && singleDeptId) {
          const dbDept = dbDepartments.find(d => d.id === singleDeptId)
          if (dbDept) {
            resolvedDeptName = dbDept.name
          } else {
            const mockDept = mockDepartments.find(d => d.id === singleDeptId)
            resolvedDeptName = mockDept?.name || 'Department'
          }
        } else if (isAdminRole) {
          resolvedDeptName = singleRole === 'national_coordinator' ? "National Coordinator's Office" : 'Secretariat Office'
        }

        const res = await fetch('/api/provision-departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            departments: [{
              id: isAdminRole ? null : singleDeptId,
              name: resolvedDeptName,
              leaderName: singleFullName,
              username: singleUsernameInput,
              email: singleEmail,
              role: singleRole
            }]
          })
        })

        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setRevealedSlips(data.slips || [])
      }

      setSingleFullName('')
      setSingleUsernameInput('')
      setSingleEmail('')
      loadData()
      showToast('Account provisioned successfully!', 'success')
    } catch (err: any) {
      showToast(`Provisioning failed: ${err.message}`, 'error')
    } finally {
      setSavingSingle(false)
    }
  }

  // Provision single row in bulk table
  const handleProvisionRow = async (row: BulkRow) => {
    if (!row.leaderName.trim()) {
      showToast('Please fill in a leader name first.', 'warning')
      return
    }
    if (collisions.length > 0) {
      showToast('Please resolve username collisions before provisioning.', 'warning')
      return
    }

    setProvisioningBulk(true)
    setProvisionProgress(`Provisioning ${row.name}...`)

    try {
      if (isMock) {
        const password = generateCompliantPassword()
        const emailAddress = row.email || `${row.username}@accounts.dtce-reports.vercel.app`
        const newUserId = 'mock-bulk-' + Math.random().toString(36).substr(2, 9)

        const { store: mockStore } = require('@/utils/supabase/mockClient')
        mockStore.profiles.push({
          id: newUserId,
          email: emailAddress,
          username: row.username,
          full_name: row.leaderName,
          role: 'hod' as const,
          department_id: row.id,
          must_change_password: true,
          created_by: profile?.id,
          is_active: true
        })

        mockStore.assignments.push({
          event_id: 'event-1',
          profile_id: newUserId,
          department_id: row.id,
          role_in_event: 'hod'
        })

        setRevealedSlips([{
          fullName: row.leaderName,
          departmentName: row.name,
          username: row.username,
          temporaryPassword: password,
          role: 'HOD'
        }])
      } else {
        const res = await fetch('/api/provision-departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            departments: [{
              id: row.id,
              name: row.name,
              leaderName: row.leaderName,
              username: row.username,
              email: row.email
            }]
          })
        })

        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setRevealedSlips(data.slips || [])
      }

      loadData()
      showToast(`Provisioned ${row.name} account successfully!`, 'success')
    } catch (err: any) {
      showToast(`Provisioning failed: ${err.message}`, 'error')
    } finally {
      setProvisioningBulk(false)
      setProvisionProgress(null)
    }
  }

  // Provision All pending departments
  const handleProvisionAll = async () => {
    const pending = bulkList.filter(row => !row.isCreated && row.leaderName.trim().length > 0)
    if (pending.length === 0) {
      showToast('No new department HOD names filled in. Nothing to provision.', 'warning')
      return
    }

    if (collisions.length > 0) {
      showToast('Please resolve username conflicts first.', 'warning')
      return
    }

    setProvisioningBulk(true)
    setProvisionProgress(`Provisioning ${pending.length} departments...`)

    try {
      if (isMock) {
        const slips: CredentialSlip[] = []
        const { store: mockStore } = require('@/utils/supabase/mockClient')

        pending.forEach(row => {
          const password = generateCompliantPassword()
          const emailAddress = row.email || `${row.username}@accounts.dtce-reports.vercel.app`
          const newUserId = 'mock-bulk-' + Math.random().toString(36).substr(2, 9)

          mockStore.profiles.push({
            id: newUserId,
            email: emailAddress,
            username: row.username,
            full_name: row.leaderName,
            role: 'hod' as const,
            department_id: row.id,
            must_change_password: true,
            created_by: profile?.id,
            is_active: true
          })

          mockStore.assignments.push({
            event_id: 'event-1',
            profile_id: newUserId,
            department_id: row.id,
            role_in_event: 'hod'
          })

          slips.push({
            fullName: row.leaderName,
            departmentName: row.name,
            username: row.username,
            temporaryPassword: password,
            role: 'HOD'
          })
        })

        setRevealedSlips(slips)
      } else {
        const res = await fetch('/api/provision-departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departments: pending })
        })

        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setRevealedSlips(data.slips || [])
      }

      loadData()
      showToast(`Provisioned ${pending.length} HOD accounts successfully! Slips are revealed below.`, 'success')
    } catch (err: any) {
      showToast(`Bulk provisioning failed: ${err.message}`, 'error')
    } finally {
      setProvisioningBulk(false)
      setProvisionProgress(null)
    }
  }

  // Export newly provisioned slips to CSV
  const handleExportCSV = () => {
    if (revealedSlips.length === 0) return

    const headers = 'Department,Leader Name,Username,Temporary Password,Role\n'
    const rows = revealedSlips
      .map(slip => `"${slip.departmentName}","${slip.fullName}","${slip.username}","${slip.temporaryPassword}","${slip.role}"`)
      .join('\n')

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `DTCE_Credentials_Export_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Loading Account Center...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mesh" style={{ background: 'var(--background)' }}>
      {/* Header Block */}
      <div className="border-b bg-card border-border">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between py-6 px-4 md:px-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Secretariat Command Center</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Leader Account Provisioning</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Provision HOD and department assistant logins securely on Supabase.</p>
          </div>
          <div className="flex items-center">
            <Link href="/dashboard">
              <button
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all duration-200 bg-card border border-border text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ➔ Oversight Dashboard
              </button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
        
        {/* Provision Slips Reveal Overlay */}
        {revealedSlips.length > 0 && (
          <div className="rounded-2xl p-6 space-y-6 print-container" style={{ background: 'rgba(245,158,11,0.04)', border: '1px dashed rgba(245,158,11,0.25)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print-hide">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>🎫</span> Newly Issued HOD Credentials ({revealedSlips.length})
                </h3>
                <p className="text-[12px] text-slate-500 mt-1">
                  Copy passwords now. These will never be re-fetchable after this view closes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="h-8 rounded-lg px-4 text-[12px] font-semibold text-white transition-all bg-slate-900 border border-slate-700 hover:bg-slate-800"
                >
                  Print All Slips
                </button>
                <button
                  onClick={handleExportCSV}
                  className="h-8 rounded-lg px-4 text-[12px] font-semibold text-amber-400 transition-all border border-amber-900/30 bg-amber-950/20 hover:bg-amber-950/40"
                >
                  Download CSV
                </button>
              </div>
            </div>

            {/* Grid of Slips - Styled like vintage ledger slips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-slips-grid">
              {revealedSlips.map((slip, i) => (
                <div
                  key={i}
                  className="rounded-xl p-5 relative overflow-hidden flex flex-col justify-between print-slip-card"
                  style={{
                    background: 'rgba(12,18,32,0.92)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    pageBreakAfter: 'always',
                  }}
                >
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
                        <span className="font-mono text-slate-400">dtce-reports.vercel.app</span>
                      </div>
                    </div>

                    <div className="rounded-xl p-3.5 grid grid-cols-2 gap-3 text-[12px] font-mono" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <span className="text-slate-500 block text-[8px] uppercase">Username</span>
                        <span className="font-bold text-slate-200 select-all">{slip.username}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[8px] uppercase">Temporary Password</span>
                        <span className="font-bold text-amber-400 select-all">{slip.temporaryPassword}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-4 leading-tight italic">
                    * Password change is mandatory upon first login for safety.
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end print-hide">
              <button
                onClick={() => setRevealedSlips([])}
                className="text-[12px] font-semibold text-slate-500 hover:text-slate-400 transition-colors"
              >
                Clear Slip View
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print-hide">
          {/* Single HOD creator form */}
          <div className="lg:col-span-1">
            <div className="glass-card p-5 space-y-4">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Single Provision</h2>
                <p className="text-[12px] text-slate-500">Generate a specific department head login.</p>
              </div>

              <form onSubmit={handleCreateSingle} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="single-fullname" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Leader Full Name</label>
                  <input
                    id="single-fullname"
                    value={singleFullName}
                    onChange={(e) => handleSingleNameChange(e.target.value)}
                    placeholder="e.g. Pastor David Adebayo"
                    required
                    className="input-dark"
                  />
                </div>

                {!(singleRole === 'super_admin' || singleRole === 'coordinator' || singleRole === 'national_coordinator') && (
                  <div className="space-y-1.5">
                    <label htmlFor="single-dept" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Target Department</label>
                    <select
                      id="single-dept"
                      value={singleDeptId}
                      onChange={(e) => handleSingleDeptSelectChange(e.target.value)}
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
                )}

                <div className="space-y-1.5">
                  <label htmlFor="single-username" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Generated Username</label>
                  <input
                    id="single-username"
                    value={singleUsernameInput}
                    onChange={(e) => setSingleUsernameInput(e.target.value)}
                    placeholder="Auto-suggested username"
                    required
                    className="input-dark font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="single-email" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Leader Real Email (Optional)</label>
                  <input
                    id="single-email"
                    value={singleEmail}
                    onChange={(e) => setSingleEmail(e.target.value)}
                    placeholder="leader@gmail.com"
                    className="input-dark"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="single-role" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">System Role</label>
                  <select
                    id="single-role"
                    value={singleRole}
                    onChange={(e: any) => setSingleRole(e.target.value)}
                    className="w-full h-9 rounded-lg px-3 text-[13px] font-medium text-slate-300 cursor-pointer"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      outline: 'none',
                    }}
                  >
                    {profile?.role === 'super_admin' && (
                      <option value="hod" style={{ background: '#111827' }}>HOD (Department Head)</option>
                    )}
                    <option value="assistant" style={{ background: '#111827' }}>Assistant</option>
                    {profile?.role === 'super_admin' && (
                      <option value="coordinator" style={{ background: '#111827' }}>Coordinator</option>
                    )}
                    {profile?.role === 'super_admin' && (
                      <option value="national_coordinator" style={{ background: '#111827' }}>National Coordinator</option>
                    )}
                    {profile?.role === 'super_admin' && (
                      <option value="super_admin" style={{ background: '#111827' }}>Super Admin</option>
                    )}
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

          {/* Bulk HOD table Provision List (Grid of 40 departments) */}
          <div className="lg:col-span-2">
            <div className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
              <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
                <div>
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Bulk HOD Provisioning Grid</h2>
                  <p className="text-[12px] text-slate-500">Grid lists all {bulkList.length} departments. Enter leader names to provision.</p>
                </div>
                <button
                  onClick={handleProvisionAll}
                  disabled={provisioningBulk || collisions.length > 0}
                  className="rounded-lg px-4 h-8 text-[12px] font-semibold text-white transition-all shrink-0"
                  style={{
                    background: (provisioningBulk || collisions.length > 0) ? 'rgba(245,158,11,0.05)' : 'rgba(245,158,11,0.15)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: (provisioningBulk || collisions.length > 0) ? '#64748B' : '#FCD34D',
                    cursor: (provisioningBulk || collisions.length > 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {provisioningBulk ? 'Provisioning...' : 'Provision All Grid'}
                </button>
              </div>

              {/* Progress and Collisions Warnings */}
              {provisionProgress && (
                <div className="px-5 py-3 border-b text-[12px] text-amber-400 bg-amber-950/10 border-amber-950/20">
                  ⌛ {provisionProgress}
                </div>
              )}

              {collisions.length > 0 && (
                <div className="px-5 py-3.5 border-b text-[11px] text-red-400 bg-red-950/10 border-red-950/20 space-y-1">
                  <p className="font-bold uppercase tracking-wider">⚠️ Username Collision Errors Detected:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {collisions.map((c, idx) => <li key={idx}>{c}</li>)}
                  </ul>
                </div>
              )}

              {/* Table list */}
              <div className="overflow-y-auto flex-1 scrollbar-hide">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                      <th className="p-3 w-1/4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="p-3 w-1/4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">HOD Full Name</th>
                      <th className="p-3 w-1/4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Username Slug</th>
                      <th className="p-3 w-1/8 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Real Email</th>
                      <th className="p-3 w-1/8 text-[11px] font-semibold uppercase tracking-wider text-slate-500 text-right">Status</th>
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
                            disabled={item.isCreated || provisioningBulk}
                            placeholder={item.isCreated ? 'HOD Created' : 'Enter leader name'}
                            className="input-dark h-8 text-[12px] py-0"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={item.username}
                            onChange={(e) => handleBulkUsernameChange(idx, e.target.value)}
                            disabled={item.isCreated || provisioningBulk}
                            placeholder="username.hod"
                            className="input-dark h-8 text-[12px] py-0 font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={item.email}
                            onChange={(e) => handleBulkEmailChange(idx, e.target.value)}
                            disabled={item.isCreated || provisioningBulk}
                            placeholder="Optional email"
                            className="input-dark h-8 text-[12px] py-0"
                          />
                        </td>
                        <td className="p-3 text-right">
                          {item.isCreated ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                              Created
                            </span>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              {item.leaderName.trim().length > 0 && (
                                <button
                                  onClick={() => handleProvisionRow(item)}
                                  disabled={provisioningBulk || collisions.length > 0}
                                  className="h-6 rounded px-2 text-[10px] font-bold text-white transition-all"
                                  style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}
                                >
                                  Provision
                                </button>
                              )}
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-slate-500" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                Not Created
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Accounts Audit list */}
        <div className="glass-card overflow-hidden print-hide">
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
                  const dbDept = dbDepartments.find(d => d.id === u.department_id)
                  const mockDept = mockDepartments.find(d => d.id === u.department_id)
                  const deptName = dbDept?.name || mockDept?.name || (u.department_id ? 'Department' : 'Administrative Office')
                  return (
                    <tr key={u.id} className="hover:bg-slate-900/10">
                      <td className="p-3 font-semibold text-slate-200">{u.full_name || '—'}</td>
                      <td className="p-3 font-mono text-slate-400">{u.username || '—'}</td>
                      <td className="p-3 text-slate-500">{u.email}</td>
                      <td className="p-3 font-medium text-slate-400">{deptName}</td>
                      <td className="p-3">
                        {profile?.role === 'super_admin' && u.id !== profile?.id ? (
                          <select
                            value={u.role}
                            onChange={async (e) => {
                              const newRole = e.target.value
                              const supabase = getClient()
                              const { error } = await supabase
                                .from('profiles')
                                .update({ role: newRole })
                                .eq('id', u.id)
                              if (error) {
                                showToast(`Failed to update role: ${error.message}`, 'error')
                              } else {
                                showToast(`Role updated to ${newRole} for ${u.full_name}`, 'success')
                                loadData()
                              }
                            }}
                            className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full cursor-pointer outline-none"
                            style={{
                              ...(
                                u.role === 'super_admin' ? { background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' } :
                                u.role === 'national_coordinator' ? { background: 'rgba(139,92,246,0.1)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.2)' } :
                                u.role === 'coordinator' ? { background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' } :
                                u.role === 'hod' ? { background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' } :
                                { background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }
                              )
                            }}
                          >
                            <option value="hod" style={{ background: '#111827' }}>HOD</option>
                            <option value="assistant" style={{ background: '#111827' }}>ASSISTANT</option>
                            <option value="coordinator" style={{ background: '#111827' }}>COORDINATOR</option>
                            <option value="national_coordinator" style={{ background: '#111827' }}>NATIONAL_COORDINATOR</option>
                            <option value="super_admin" style={{ background: '#111827' }}>SUPER_ADMIN</option>
                          </select>
                        ) : (
                          <span
                            className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                            style={
                              u.role === 'super_admin' ? { background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' } :
                              u.role === 'national_coordinator' ? { background: 'rgba(139,92,246,0.1)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.2)' } :
                              u.role === 'coordinator' ? { background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' } :
                              u.role === 'hod' ? { background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' } :
                              { background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }
                            }
                          >
                            {u.role}
                          </span>
                        )}
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

      {/* Global CSS Styling for Printing slips on one page per slip */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header, .print-hide, nav, button {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          .print-container {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-slips-grid {
            display: block !important;
          }
          .print-slip-card {
            border: 1px solid #ccc !important;
            background: #fff !important;
            color: #000 !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            margin-bottom: 20px !important;
            padding: 30px !important;
            border-radius: 12px !important;
            box-shadow: none !important;
          }
          .print-slip-card h4, .print-slip-card span, .print-slip-card p {
            color: black !important;
          }
        }
      `}</style>
    </div>
  )
}
