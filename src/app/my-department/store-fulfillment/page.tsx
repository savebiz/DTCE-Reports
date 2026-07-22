'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface RequestItem {
  name: string
  quantity: number
  category?: 'durable' | 'consumable'
}

interface RequisitionTicket {
  id: string
  items_json: RequestItem[]
  status: 'pending_coordinator' | 'approved' | 'declined' | 'in_progress' | 'partially_fulfilled' | 'delivered'
  reviewer_comments?: string
  reviewed_at?: string
  created_at: string
  requester?: {
    full_name: string
    email: string
  }
  department?: {
    name: string
  }
}

function StoreFulfillmentContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [departmentName, setDepartmentName] = useState('Stores')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [requisitions, setRequisitions] = useState<RequisitionTicket[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'processing' | 'delivered'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true)
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
      .maybeSingle()

    let activeProfile = prof
    if (!activeProfile) {
      const meta = (user.user_metadata || {}) as any
      activeProfile = {
        id: user.id,
        email: user.email || '',
        full_name: meta?.full_name || 'Stores HOD',
        role: meta?.role || 'hod',
        department_id: meta?.department_id || null
      }
    }

    if (!isMock) {
      const { data: assignment } = await supabase
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', activeProfile.id)
        .maybeSingle()
      if (assignment?.department_id) {
        activeProfile.department_id = assignment.department_id
      }
    }

    if (activeProfile.department_id) {
      const { data: dbDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', activeProfile.department_id)
        .maybeSingle()
      if (dbDept) setDepartmentName(dbDept.name)
    }

    setProfile(activeProfile)

    // Load Requisitions
    if (!isMock) {
      const { data: reqsData } = await supabase
        .from('store_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (reqsData) {
        const enhanced = await Promise.all(
          reqsData.map(async (r: any) => {
            const { data: reqProfile } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', r.requester_profile_id)
              .maybeSingle()
            const { data: requesterDept } = await supabase
              .from('departments')
              .select('name')
              .eq('id', r.department_id)
              .maybeSingle()
            return {
              ...r,
              requester: reqProfile || { full_name: 'Unknown HOD', email: '' },
              department: requesterDept || { name: 'Unknown Department' }
            }
          })
        )
        setRequisitions(enhanced)
      }
    } else {
      setRequisitions([
        {
          id: 'req-mock-1',
          items_json: [
            { name: 'Mattresses', quantity: 50, category: 'durable' },
            { name: 'Packs of Tissue Paper', quantity: 20, category: 'consumable' }
          ],
          status: 'pending_coordinator',
          created_at: new Date().toISOString(),
          requester: { full_name: 'Elder Robert', email: 'reg@dtce.org' },
          department: { name: 'Registration' }
        },
        {
          id: 'req-mock-2',
          items_json: [
            { name: 'Stand Fans', quantity: 4, category: 'durable' },
            { name: 'A4 Paper Rims', quantity: 5, category: 'consumable' }
          ],
          status: 'approved',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          requester: { full_name: 'Pastor Victor', email: 'acc@dtce.org' },
          department: { name: 'Accommodation' }
        }
      ])
    }

    if (showLoadingSpinner) setLoading(false)
  }

  useEffect(() => {
    loadData(true)

    // Automatic 20-Second Polling
    const interval = setInterval(() => {
      loadData(false)
    }, 20000)

    return () => clearInterval(interval)
  }, [])

  const handleUpdateStatus = async (
    reqId: string,
    newStatus: 'pending_coordinator' | 'approved' | 'in_progress' | 'partially_fulfilled' | 'delivered' | 'declined'
  ) => {
    setActionLoading(true)
    const labelMap: Record<string, string> = {
      pending_coordinator: 'Pending Approval',
      approved: 'Approved',
      in_progress: 'In Progress',
      partially_fulfilled: 'Partially Fulfilled',
      delivered: 'Delivered',
      declined: 'Declined'
    }

    if (isMock) {
      showToast(`Requisition updated to ${labelMap[newStatus]} (Mock)`, 'success')
      setRequisitions(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r))
      setActionLoading(false)
      return
    }

    try {
      const res = await fetch('/api/update-store-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: reqId, status: newStatus })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update requisition')
      }

      showToast(`Requisition updated to ${labelMap[newStatus]}!`, 'success')
      loadData(false)
    } catch (err: any) {
      showToast(`Failed to update requisition: ${err.message}`, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Filtered Requisitions
  const filteredRequisitions = requisitions.filter(r => {
    const matchesSearch =
      (r.department?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.requester?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.items_json.some(it => it.name.toLowerCase().includes(searchQuery.toLowerCase()))

    if (!matchesSearch) return false

    if (activeTab === 'pending') return r.status === 'pending_coordinator'
    if (activeTab === 'approved') return r.status === 'approved'
    if (activeTab === 'processing') return r.status === 'in_progress' || r.status === 'partially_fulfilled'
    if (activeTab === 'delivered') return r.status === 'delivered'
    return true
  })

  // Summary Counters
  const pendingCount = requisitions.filter(r => r.status === 'pending_coordinator').length
  const approvedCount = requisitions.filter(r => r.status === 'approved').length
  const processingCount = requisitions.filter(r => r.status === 'in_progress' || r.status === 'partially_fulfilled').length
  const deliveredCount = requisitions.filter(r => r.status === 'delivered').length

  return (
    <div className="min-h-screen transition-colors duration-200" style={{ background: 'var(--background)' }}>
      {/* 1. Integrated Breadcrumb Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/my-department')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>←</span> Back to {departmentName} Dashboard
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Stores Fulfillment Hub</span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-6">
        {/* 2. Page Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="text-[11px] font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase">Stores Department Console</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Stores Requisitions & Fulfillment Hub
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Review, process, and track material requests submitted across all convention departments.
            </p>
          </div>

          {/* 3. Button Hierarchy: Informational Status Pill vs Secondary Refresh Button */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold select-none">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Auto-Sync (20s)
            </span>
            <Button
              onClick={() => loadData(true)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold h-9 px-3.5 border-border/70 hover:bg-accent/60 transition-colors shadow-xs"
            >
              🔄 Refresh List
            </Button>
          </div>
        </div>

        {/* 4. Overview Stats Cards (Stripe Pattern Typography & Elevation System) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Total Requests</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground mt-2 mb-0.5 tracking-tight font-mono block">{requisitions.length}</span>
            <span className="text-[10px] text-muted-foreground font-medium">All department submissions</span>
          </Card>
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Pending Approval</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-amber-600 dark:text-amber-400 mt-2 mb-0.5 tracking-tight font-mono block">{pendingCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Awaiting Coordinator</span>
          </Card>
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">In Processing</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-purple-600 dark:text-purple-400 mt-2 mb-0.5 tracking-tight font-mono block">{processingCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Currently being fulfilled</span>
          </Card>
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Delivered</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 mb-0.5 tracking-tight font-mono block">{deliveredCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Successfully completed</span>
          </Card>
        </div>

        {/* 5. Segmented Filter Control (Linear Style Cohesive Track) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-2 rounded-2xl border border-border/50 shadow-[0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-muted/40 dark:bg-slate-800/40 rounded-xl border border-border/30">
            {[
              { id: 'all', label: 'All', count: requisitions.length },
              { id: 'pending', label: 'Pending', count: pendingCount },
              { id: 'approved', label: 'Approved', count: approvedCount },
              { id: 'processing', label: 'In Progress', count: processingCount },
              { id: 'delivered', label: 'Delivered', count: deliveredCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-xs border border-border/50 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted/60 text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <Input
            placeholder="Search by department or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs bg-background/60 border-border/60 focus:bg-background transition-colors"
          />
        </div>

        {/* 6. Requisition List Item Cards (Left Status Accent Bar & Material Chips) */}
        {loading ? (
          <div className="text-center py-16 space-y-2">
            <span className="text-sm font-mono animate-pulse text-muted-foreground">Loading Requisitions Console...</span>
          </div>
        ) : filteredRequisitions.length === 0 ? (
          <Card className="bg-card rounded-xl p-12 text-center space-y-3 border border-border/50 shadow-xs">
            <span className="text-4xl block">📦</span>
            <p className="text-sm font-semibold text-muted-foreground">No material requisitions match your filter criteria.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRequisitions.map(req => (
              <Card
                key={req.id}
                className="relative bg-card rounded-xl border border-border/50 overflow-hidden shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_4px_12px_rgba(15,42,74,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
              >
                {/* Left Status Accent Bar (Linear / Ramp Pattern) */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 sm:w-1.5"
                  style={{
                    backgroundColor:
                      req.status === 'pending_coordinator' ? '#F59E0B' :
                      req.status === 'approved' ? '#3B82F6' :
                      req.status === 'in_progress' ? '#8B5CF6' :
                      req.status === 'partially_fulfilled' ? '#EC4899' :
                      req.status === 'delivered' ? '#10B981' : '#EF4444'
                  }}
                />

                {/* Tightened Header Row */}
                <CardHeader className="pl-5 sm:pl-6 pr-4 sm:pr-6 py-3.5 border-b border-border/40 bg-muted/20 dark:bg-slate-900/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-foreground tracking-tight">
                          {req.department?.name || 'Department'} Requisition
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Requested by <strong className="text-foreground font-semibold">{req.requester?.full_name}</strong> • Submitted {new Date(req.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full"
                        style={
                          req.status === 'pending_coordinator' ? { background: 'rgba(245,158,11,0.12)', color: '#D97706', border: '1px solid rgba(245,158,11,0.3)' } :
                          req.status === 'approved' ? { background: 'rgba(59,130,246,0.12)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.3)' } :
                          req.status === 'in_progress' ? { background: 'rgba(139,92,246,0.12)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.3)' } :
                          req.status === 'partially_fulfilled' ? { background: 'rgba(236,72,153,0.12)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.3)' } :
                          req.status === 'delivered' ? { background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' } :
                          { background: 'rgba(239,68,68,0.12)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.3)' }
                        }
                      >
                        {req.status === 'pending_coordinator' ? 'Pending Approval' :
                         req.status === 'approved' ? 'Approved' :
                         req.status === 'in_progress' ? 'In Progress' :
                         req.status === 'partially_fulfilled' ? 'Partially Fulfilled' :
                         req.status === 'delivered' ? 'Delivered' : 'Declined'}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pl-5 sm:pl-6 pr-4 sm:pr-6 pt-4 pb-4 space-y-4">
                  {/* Requested Material Items Chips */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">Requested Material Items</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {req.items_json && Array.isArray(req.items_json) && req.items_json.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 dark:bg-slate-800/40 border border-border/50 text-xs hover:border-border/80 transition-colors">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-foreground block">{item.name}</span>
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground">
                              {item.category || 'durable'}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            × {item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {req.reviewer_comments && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                      <strong>Coordinator Notes:</strong> {req.reviewer_comments}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/40">
                    <div>
                      {req.status === 'pending_coordinator' && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold italic flex items-center gap-1.5">
                          <span>⏳</span> Awaiting National Coordinator Approval
                        </span>
                      )}
                      {req.status === 'approved' && (
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                          <span>✅</span> Requisition Approved — Ready for Fulfillment
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {req.status === 'approved' && (
                        <Button
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(req.id, 'in_progress')}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 shadow-xs"
                        >
                          Start Processing
                        </Button>
                      )}

                      {req.status === 'in_progress' && (
                        <>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'partially_fulfilled')}
                            className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs h-8 shadow-xs"
                          >
                            Partial Delivery
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'delivered')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 shadow-xs"
                          >
                            Mark Delivered
                          </Button>
                        </>
                      )}

                      {req.status === 'partially_fulfilled' && (
                        <Button
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(req.id, 'delivered')}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 shadow-xs"
                        >
                          Mark Fully Delivered
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default function StoreFulfillmentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm font-mono text-muted-foreground">Loading Stores Fulfillment...</div>}>
      <StoreFulfillmentContent />
    </Suspense>
  )
}
