'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, mockEventDays, Profile, DailyReport, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { syncQueuedSubmissions, getSyncQueue } from '@/utils/offline'
import { store } from '@/utils/supabase/mockClient'

export default function MyDepartmentDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [eventDays, setEventDays] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [allDepartments, setAllDepartments] = useState<Department[]>([])
  
  // Connection & Sync States
  const [isOnline, setIsOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // Stores fulfillment state
  const [approvedRequests, setApprovedRequests] = useState<any[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  // 1. Monitor network state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      const handleOnline = () => {
        setIsOnline(true)
        triggerSync()
      }
      const handleOffline = () => setIsOnline(false)

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  // Reload reports when active department changes (for acting admins)
  useEffect(() => {
    if (profile?.department_id && (profile.role === 'super_admin' || profile.role === 'coordinator')) {
      const reloadReports = async () => {
        const supabase = getClient()
        const { data: reps } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('department_id', profile.department_id)
        setReports(reps || [])
        
        const isStores = profile.department_id === 'dept-29' || 
                         profile.department_id === '43fe996e-db9b-4e94-8311-99528b8bb690' ||
                         department?.name?.toLowerCase().includes('stores')
        if (isStores) {
          if (!isMock) {
            const { data: appReqs } = await supabase
              .from('store_requests')
              .select('*')
              .eq('status', 'approved')
              .order('created_at', { ascending: false })
            
            if (appReqs) {
              const enhanced = await Promise.all(appReqs.map(async (r: any) => {
                const { data: reqProfile } = await supabase.from('profiles').select('full_name, email').eq('id', r.requester_profile_id).maybeSingle()
                const { data: requesterDept } = await supabase.from('departments').select('name').eq('id', r.department_id).maybeSingle()
                return {
                  ...r,
                  requester: reqProfile || { full_name: 'Unknown HOD', email: '' },
                  department: requesterDept || { name: 'Unknown Department' }
                }
              }))
              setApprovedRequests(enhanced)
            }
          }
        }
      }
      reloadReports()
    }
  }, [profile?.department_id, department?.name])

  // 2. Load User Profile and Data
  const loadData = async () => {
    const supabase = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch profile
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
        department_id: meta?.department_id || 'dept-10', // Default to Medical HOD
        username: meta?.username || user.email?.split('@')[0] || 'user',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      if ((!activeProfile.department_id || activeProfile.department_id.startsWith('dept-')) && !isMock) {
        const { data: assignment } = await supabase
          .from('hod_assignments')
          .select('department_id')
          .eq('profile_id', activeProfile.id)
          .maybeSingle()
        if (assignment?.department_id) {
          activeProfile.department_id = assignment.department_id
        }
      }

      const isAdmin = activeProfile.role === 'super_admin' || activeProfile.role === 'coordinator'
      let sortedDepts: Department[] = []
      if (isAdmin) {
        const { data: depts } = await supabase.from('departments').select('*')
        sortedDepts = ((depts || mockDepartments) as Department[]).sort((a,b) => a.name.localeCompare(b.name))
        setAllDepartments(sortedDepts)
        
        if (!activeProfile.department_id && sortedDepts.length > 0) {
          activeProfile.department_id = sortedDepts[0].id
        }
      }

      let activeDept: any = null
      if (activeProfile.department_id) {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('*')
          .eq('id', activeProfile.department_id)
          .maybeSingle()
        if (dbDept) {
          activeDept = dbDept
        } else {
          activeDept = mockDepartments.find(d => d.id === activeProfile.department_id)
        }
      }
      if (activeDept) {
        setDepartment(activeDept)
      }
      setProfile(activeProfile)

      // Fetch days
      let days = []
      const { data: daysDb } = await supabase
        .from('event_days')
        .select('*')
        .order('day_number', { ascending: true })
      days = daysDb || []
      setEventDays(days)

      // Fetch existing reports
      const { data: reps } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('department_id', activeProfile.department_id)
      setReports(reps || [])

      // Fetch approved store requisitions if Stores department
      const isStores = activeProfile.department_id === 'dept-29' || 
                       activeProfile.department_id === '43fe996e-db9b-4e94-8311-99528b8bb690' ||
                       activeDept?.name?.toLowerCase().includes('stores')
      if (isStores) {
        if (!isMock) {
          const { data: appReqs } = await supabase
            .from('store_requests')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
          
          if (appReqs) {
            const enhanced = await Promise.all(appReqs.map(async (r: any) => {
              const { data: reqProfile } = await supabase.from('profiles').select('full_name, email').eq('id', r.requester_profile_id).maybeSingle()
              const { data: requesterDept } = await supabase.from('departments').select('name').eq('id', r.department_id).maybeSingle()
              return {
                ...r,
                requester: reqProfile || { full_name: 'Unknown HOD', email: '' },
                department: requesterDept || { name: 'Unknown Department' }
              }
            }))
            setApprovedRequests(enhanced)
          }
        } else {
          setApprovedRequests([
            {
              id: 'req-mock-stores-1',
              items_json: [{ name: 'Mattresses', quantity: 50, category: 'durable' }],
              status: 'approved',
              created_at: new Date().toISOString(),
              requester: { full_name: 'Elder Robert', email: 'reg@dtce.org' },
              department: { name: 'Registration' }
            }
          ])
        }
      }
    }

    // Load offline sync queue
    const queue = await getSyncQueue()
    setPendingSyncCount(queue.length)
  }

  useEffect(() => {
    loadData()
  }, [])

  // 3. Trigger Offline Sync
  const triggerSync = async () => {
    if (!isOnline || syncing) return
    setSyncing(true)
    try {
      const { syncedCount, errors } = await syncQueuedSubmissions(getClient())
      if (syncedCount > 0) {
        showToast(`Successfully uploaded ${syncedCount} offline report(s)!`, 'success')
        loadData()
      }
    } catch (e: any) {
      console.error(e)
    } finally {
      setSyncing(false)
    }
  }

  // 4. Mark Request as Delivered
  const handleMarkAsDelivered = async (reqId: string) => {
    setActionLoading(true)
    const supabase = getClient()
    if (isMock) {
      showToast('Requisition marked as delivered (Mock Mode)', 'success')
      setApprovedRequests(prev => prev.filter(r => r.id !== reqId))
      setActionLoading(false)
      return
    }

    try {
      const { error } = await supabase
        .from('store_requests')
        .update({ status: 'delivered' })
        .eq('id', reqId)

      if (error) throw error

      showToast('Items issued and marked as delivered successfully!', 'success')
      loadData()
    } catch (e: any) {
      showToast(`Failed to update request: ${e.message}`, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Status pill helper
  const getStatusPill = (dayId: string) => {
    const report = reports.find(r => r.event_day_id === dayId)
    if (!report) {
      return (
        <span className="inline-flex items-center rounded-full bg-red-500/10 text-red-400 px-2.5 py-0.5 text-xs font-bold border border-red-500/20 uppercase tracking-wider font-sans">
          Missing
        </span>
      )
    }

    switch (report.status) {
      case 'draft':
        return (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 px-2.5 py-0.5 text-xs font-bold border border-amber-500/20 uppercase tracking-wider font-sans">
            Draft
          </span>
        )
      case 'submitted':
        return (
          <span className="inline-flex items-center rounded-full bg-blue-500/10 text-blue-400 px-2.5 py-0.5 text-xs font-bold border border-blue-500/20 uppercase tracking-wider font-sans">
            Submitted
          </span>
        )
      case 'reviewed':
      case 'approved':
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 text-xs font-bold border border-emerald-500/20 uppercase tracking-wider font-sans">
            Approved
          </span>
        )
      default:
        return null
    }
  }

  const getButtonText = (dayId: string) => {
    const report = reports.find(r => r.event_day_id === dayId)
    if (!report) return "Enter today's data"
    if (report.status === 'draft') return 'Continue draft'
    return 'View submission'
  }

  const openEntryForm = (day: any) => {
    router.push(`/my-department/daily-log?dayId=${day.id}`)
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Loading Dashboard Checklist...</p>
      </div>
    )
  }

  const isStoresDept = profile.department_id === 'dept-29' || 
                       profile.department_id === '43fe996e-db9b-4e94-8311-99528b8bb690' ||
                       department?.name?.toLowerCase().includes('stores')

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>

      {/* Connectivity Status Bar */}
      <div
        className="flex items-center justify-between px-4 md:px-6 py-2 text-[12px]"
        style={{ background: 'rgba(0,0,0,0.1)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: isOnline ? '#10B981' : '#F59E0B',
              boxShadow: isOnline ? '0 0 6px #10B981' : '0 0 6px #F59E0B',
            }}
          />
          <span className="font-semibold" style={{ color: isOnline ? '#10B981' : '#F59E0B' }}>
            {isOnline ? 'Connected' : 'Offline Mode'}
          </span>
        </div>
        {pendingSyncCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-amber-500 font-semibold">{pendingSyncCount} pending upload(s)</span>
            {isOnline && (
              <button
                className="h-6 rounded-lg px-3 text-[11px] font-semibold text-white transition-all bg-amber-500"
                onClick={triggerSync}
                disabled={syncing}
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
            )}
          </div>
        )}
      </div>

      <main className="mx-auto max-w-4xl px-4 md:px-6 py-8">
        <div className="space-y-6 animate-fade-in-up">
          {/* Department Switcher for Admin/Coordinators */}
          {(profile.role === 'super_admin' || profile.role === 'coordinator') && allDepartments.length > 0 && (
            <div className="flex items-center gap-3 bg-card border border-border p-4 rounded-xl">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Act on behalf of:</span>
              <select
                value={profile.department_id || ''}
                onChange={(e) => {
                  const newDeptId = e.target.value
                  setProfile({ ...profile, department_id: newDeptId })
                  const d = allDepartments.find(ad => ad.id === newDeptId)
                  if (d) setDepartment(d)
                }}
                className="bg-background border border-border rounded-lg text-xs font-semibold px-3 py-1.5 text-foreground h-9"
              >
                {allDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">HOD Controls</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {department?.name || 'Department'} Dashboard
              </h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">Fill daily reporting metrics for each convention day.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all border border-amber-500/20 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 cursor-pointer"
                onClick={() => router.push('/my-department/daily-log')}
              >
                <span>📅</span>
                Daily Logs Workspace
              </button>
              <button
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all border border-border bg-card text-foreground cursor-pointer"
                onClick={() => router.push('/my-department/store-request')}
              >
                <span>📦</span>
                Store Request
              </button>
              {profile?.role !== 'assistant' && (
                <>
                  <button
                    className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all border border-border bg-card text-foreground cursor-pointer"
                    onClick={() => router.push('/my-department/team')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Manage Team
                  </button>
                  <button
                    className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all border border-border bg-card text-foreground cursor-pointer"
                    onClick={() => router.push('/my-department/narrative')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Event Narrative
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Day Checklist */}
          <div className="glass-card overflow-hidden">
            {eventDays.length === 0 ? (
              <div className="text-center py-12 px-5 space-y-4">
                <span className="text-3xl block">📅</span>
                <p className="text-[13px] text-muted-foreground italic">No active event convention days found in the database.</p>
                <button
                  onClick={() => router.push('/my-department/daily-log')}
                  className="h-9 rounded-xl px-5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black cursor-pointer transition-all"
                >
                  Go to Daily Logs Workspace
                </button>
              </div>
            ) : (
              eventDays.map((day, i) => (
                <div
                  key={day.id}
                  className="flex items-center justify-between px-5 py-4 transition-all duration-150 border-b border-border/40 last:border-b-0 hover:bg-slate-900/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-tabular text-[11px] font-bold text-slate-500 w-10">
                      Day {day.day_number}
                    </span>
                    <span className="text-[14px] font-medium">
                      {new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {getStatusPill(day.id)}
                    <button
                      onClick={() => openEntryForm(day)}
                      className="h-8 rounded-lg px-4 text-[12px] font-semibold transition-all duration-150 cursor-pointer border border-border bg-card hover:bg-slate-950/10 dark:hover:bg-white/10"
                    >
                      {getButtonText(day.id)}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Stores Department - Approved requisitions view */}
          {isStoresDept && (
            <Card className="glass-card border-none mt-8">
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                  Approved Requisitions for Fulfillment
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Issue durables or consumables and mark them as delivered when collected.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {approvedRequests.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No approved requisitions pending delivery.</p>
                ) : (
                  <div className="space-y-4">
                    {approvedRequests.map((req) => (
                      <div key={req.id} className="border border-border rounded-xl p-4 space-y-3 bg-background/25">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-bold text-foreground block">
                              {req.department?.name} Department Requisition
                            </span>
                            <span className="text-[10px] text-muted-foreground block mt-0.5">
                              Approved by Coordinator • Ordered by {req.requester?.full_name}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleMarkAsDelivered(req.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8"
                          >
                            Mark as Delivered
                          </Button>
                        </div>

                        {/* List items requested */}
                        <div className="p-3 bg-background/40 border border-border rounded-lg space-y-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-sans">Material details:</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            {req.items_json.map((it: any, itIdx: number) => (
                              <div key={itIdx} className="flex justify-between border-b border-border/40 pb-1">
                                <span className="text-foreground">{it.name} <span className="text-[10px] text-muted-foreground capitalize">({it.category})</span></span>
                                <span className="font-bold text-foreground font-mono">x {it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {req.reviewer_comments && (
                          <div className="text-[11px] text-amber-500 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                            <strong>Coordinator instruction:</strong> {req.reviewer_comments}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
