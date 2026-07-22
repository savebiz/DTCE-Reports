'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
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

    // Automatic 6-Second Polling
    const interval = setInterval(() => {
      loadData(false)
    }, 6000)

    return () => clearInterval(interval)
  }, [])

  const handleUpdateStatus = async (
    reqId: string,
    newStatus: 'pending_coordinator' | 'approved' | 'in_progress' | 'partially_fulfilled' | 'delivered' | 'declined'
  ) => {
    setActionLoading(true)
    const supabase = getClient()
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
      const { error } = await supabase
        .from('store_requests')
        .update({ status: newStatus })
        .eq('id', reqId)

      if (error) throw error

      showToast(`Requisition updated to ${labelMap[newStatus]}!`, 'success')
      loadData()
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
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Top Bar */}
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 border-b"
        style={{ background: 'rgba(0,0,0,0.15)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => router.push('/my-department')}
          className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>←</span> Back to {departmentName} Dashboard
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Stores Fulfillment Hub</span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-6">
        {/* Page Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-[11px] font-bold tracking-widest text-amber-500 uppercase">Stores Department Console</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Stores Requisitions & Fulfillment Hub
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Review, process, and track material requests submitted across all convention departments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Auto-Sync (6s)
            </span>
            <Button
              onClick={() => loadData(true)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold h-9"
            >
              🔄 Refresh List
            </Button>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Total Requests</span>
            <span className="text-2xl font-black text-foreground mt-1 block font-mono">{requisitions.length}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block">Pending Approval</span>
            <span className="text-2xl font-black text-amber-500 mt-1 block font-mono">{pendingCount}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block">In Processing</span>
            <span className="text-2xl font-black text-purple-400 mt-1 block font-mono">{processingCount}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">Delivered</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block font-mono">{deliveredCount}</span>
          </Card>
        </div>

        {/* Filter Controls & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card border border-border p-3 rounded-xl">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `All (${requisitions.length})` },
              { id: 'pending', label: `Pending (${pendingCount})` },
              { id: 'approved', label: `Approved (${approvedCount})` },
              { id: 'processing', label: `In Progress (${processingCount})` },
              { id: 'delivered', label: `Delivered (${deliveredCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Input
            placeholder="Search by department or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs"
          />
        </div>

        {/* Requisitions List */}
        {loading ? (
          <div className="text-center py-16 space-y-2">
            <span className="text-sm font-mono animate-pulse text-muted-foreground">Loading Requisitions Console...</span>
          </div>
        ) : filteredRequisitions.length === 0 ? (
          <Card className="glass-card border-none p-12 text-center space-y-3">
            <span className="text-4xl block">📦</span>
            <p className="text-sm font-semibold text-muted-foreground">No material requisitions match your filter criteria.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRequisitions.map(req => (
              <Card key={req.id} className="glass-card border-none overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/40 bg-card/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-foreground">
                          {req.department?.name || 'Department'} Requisition
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Requested by <strong className="text-foreground">{req.requester?.full_name}</strong> • Submitted {new Date(req.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full"
                        style={
                          req.status === 'pending_coordinator' ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' } :
                          req.status === 'approved' ? { background: 'rgba(59,130,246,0.15)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.3)' } :
                          req.status === 'in_progress' ? { background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' } :
                          req.status === 'partially_fulfilled' ? { background: 'rgba(236,72,153,0.15)', color: '#F472B6', border: '1px solid rgba(236,72,153,0.3)' } :
                          req.status === 'delivered' ? { background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' } :
                          { background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }
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

                <CardContent className="pt-4 space-y-4">
                  {/* Requested Items List */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Requested Material Items</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {req.items_json && Array.isArray(req.items_json) && req.items_json.map((item, idx) => (
                        <div key={idx} className="bg-background/50 border border-border/60 p-2.5 rounded-lg flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-foreground block">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase">{item.category || 'durable'}</span>
                          </div>
                          <span className="font-mono font-bold text-amber-500 text-sm">x {item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {req.reviewer_comments && (
                    <div className="text-xs text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                      <strong>Coordinator Notes:</strong> {req.reviewer_comments}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border/40">
                    {(req.status === 'pending_coordinator' || req.status === 'approved') && (
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus(req.id, 'in_progress')}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8"
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
                          className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs h-8"
                        >
                          Partial Delivery
                        </Button>
                        <Button
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(req.id, 'delivered')}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8"
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
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8"
                      >
                        Mark Fully Delivered
                      </Button>
                    )}

                    {req.status !== 'declined' && req.status !== 'delivered' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus(req.id, 'declined')}
                        className="text-xs h-8 text-rose-400 hover:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                      >
                        Decline
                      </Button>
                    )}
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
