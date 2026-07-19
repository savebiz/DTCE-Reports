'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { DashboardHeader } from '@/components/dashboard-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RequestItem {
  name: string
  quantity: number
  category: 'durable' | 'consumable'
}

interface StoreRequestTicket {
  id: string
  items_json: RequestItem[]
  status: 'pending_coordinator' | 'approved' | 'declined' | 'delivered'
  reviewer_comments?: string
  reviewed_at?: string
  created_at: string
  requester_profile_id: string
  department_id: string
  assigned_approver_id?: string
  requester?: {
    full_name: string
    email: string
  }
  department?: {
    name: string
  }
}

function AdminRequisitionsContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<StoreRequestTicket[]>([])
  
  // Available reviewers list for delegation dropdown
  const [approvers, setApprovers] = useState<Profile[]>([])
  
  // Review Modal State
  const [selectedReq, setSelectedReq] = useState<StoreRequestTicket | null>(null)
  const [actionComments, setActionComments] = useState('')
  const [delegateId, setDelegateId] = useState<string>('none')

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
    if (!activeProfile) {
      const meta = (user.user_metadata || {}) as any
      activeProfile = {
        id: user.id,
        role: meta.role || 'hod',
        department_id: meta.department_id || 'dept-10'
      }
    }
    setProfile(activeProfile)

    if (activeProfile.role !== 'super_admin' && activeProfile.role !== 'coordinator') {
      // Check if they are a delegated approver instead
      if (!isMock) {
        const { data: hasAssigned } = await supabase
          .from('store_requests')
          .select('id')
          .eq('assigned_approver_id', activeProfile.id)
          .limit(1)
        if (!hasAssigned || hasAssigned.length === 0) {
          router.push('/dashboard')
          return
        }
      } else {
        router.push('/dashboard')
        return
      }
    }

    if (!isMock) {
      // Fetch all requests
      const { data: reqsData } = await supabase
        .from('store_requests')
        .select('*')
        .order('created_at', { ascending: false })

      // Fetch requester and department details
      if (reqsData) {
        const enhanced: StoreRequestTicket[] = await Promise.all(
          reqsData.map(async (r: any) => {
            const { data: reqProfile } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', r.requester_profile_id)
              .maybeSingle()
            
            const { data: dept } = await supabase
              .from('departments')
              .select('name')
              .eq('id', r.department_id)
              .maybeSingle()

            return {
              ...r,
              requester: reqProfile || { full_name: 'Unknown HOD', email: '' },
              department: dept || { name: 'Unknown Department' }
            }
          })
        )
        setRequests(enhanced)
      }

      // Fetch all potential reviewers (admins/coordinators/assistants)
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['super_admin', 'coordinator', 'assistant'])
      setApprovers(allUsers || [])
    } else {
      // Mock requests
      setRequests([
        {
          id: 'req-mock-1',
          items_json: [{ name: ' Analgesics', quantity: 200, category: 'consumable' }],
          status: 'pending_coordinator',
          created_at: new Date().toISOString(),
          requester_profile_id: 'user-hod-med',
          department_id: 'dept-10',
          requester: { full_name: 'Dr. Smith (HOD)', email: 'smith.medical@dtce.org' },
          department: { name: 'Medical' }
        }
      ])
      setApprovers([
        { id: 'user-coord', email: 'coordinator@dtce.org', full_name: 'Coordinator Jane', role: 'coordinator' },
        { id: 'user-asst-med', email: 'assistant@dtce.org', full_name: 'Nurse Kelly', role: 'assistant' }
      ])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAction = async (status: 'approved' | 'declined') => {
    if (!selectedReq) return
    setLoading(true)
    const supabase = getClient()

    if (isMock) {
      showToast(`Request ${status} successfully!`, 'success')
      setRequests(prev => prev.map(r => r.id === selectedReq.id ? { ...r, status, reviewer_comments: actionComments } : r))
      setSelectedReq(null)
      setActionComments('')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase
        .from('store_requests')
        .update({
          status,
          reviewer_comments: actionComments,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedReq.id)

      if (error) throw error

      showToast(`Requisition order ${status}!`, 'success')
      setSelectedReq(null)
      setActionComments('')
      loadData()
    } catch (err: any) {
      showToast(`Failed to update status: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelegate = async () => {
    if (!selectedReq) return
    setLoading(true)
    const supabase = getClient()
    const targetDelegateId = delegateId === 'none' ? null : delegateId

    if (isMock) {
      showToast('Approver delegated successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase
        .from('store_requests')
        .update({
          assigned_approver_id: targetDelegateId
        })
        .eq('id', selectedReq.id)

      if (error) throw error

      showToast('Authority delegated successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      loadData()
    } catch (err: any) {
      showToast(`Delegation failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <DashboardHeader />
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Oversight Store Requisitions Console</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Approve, decline, or delegate incoming material requisition logs.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Requests List Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card border-none">
              <CardHeader>
                <div className="text-base font-bold text-foreground uppercase tracking-wider">
                  Requisitions Tickets
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {requests.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No requisition logs found in database.</p>
                ) : (
                  <div className="space-y-4">
                    {requests.map((req) => (
                      <div key={req.id} className="border border-border rounded-xl p-4 space-y-3 bg-background/25">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[12px] font-bold text-foreground block">
                              {req.department?.name} Department
                            </span>
                            <span className="text-[10px] text-muted-foreground block mt-0.5">
                              Submitted by {req.requester?.full_name || req.requester?.email} on {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                            style={
                              req.status === 'pending_coordinator' ? { background: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' } :
                              req.status === 'approved' ? { background: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' } :
                              req.status === 'delivered' ? { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' } :
                              { background: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }
                            }
                          >
                            {req.status.replace('_', ' ')}
                          </span>
                        </div>

                        {/* List items requested */}
                        <div className="p-3 bg-background/40 border border-border rounded-lg space-y-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-sans">Items requested:</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            {req.items_json.map((it, itIdx) => (
                              <div key={itIdx} className="flex justify-between border-b border-border/40 pb-1">
                                <span className="text-foreground">{it.name} <span className="text-[10px] text-muted-foreground capitalize">({it.category})</span></span>
                                <span className="font-bold text-foreground font-mono">x {it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {req.reviewer_comments && (
                          <div className="text-[11px] p-2 bg-background/50 border border-border rounded-lg text-muted-foreground">
                            <strong>Review Remarks:</strong> {req.reviewer_comments}
                          </div>
                        )}

                        {/* Actions buttons */}
                        {req.status === 'pending_coordinator' && (
                          <div className="flex gap-2 justify-end pt-1">
                            <Button size="sm" variant="outline" onClick={() => setSelectedReq(req)} className="text-xs h-8">
                              Review &amp; Approve
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Action Form Column (Sticky review) */}
          <div className="lg:col-span-1">
            {selectedReq ? (
              <Card className="glass-card border-none sticky top-20">
                <CardHeader>
                  <div className="text-base font-bold text-foreground uppercase tracking-wider">
                    Review: {selectedReq.department?.name} Request
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Delegate selector */}
                  <div className="space-y-2 pb-4 border-b border-border">
                    <Label htmlFor="del-user" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Delegate Approval Task</Label>
                    <div className="flex gap-2">
                      <Select
                        value={delegateId}
                        onValueChange={(val) => setDelegateId(val || 'none')}
                      >
                        <SelectTrigger id="del-user" className="h-9 text-foreground bg-card border-border flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Delegate (None)</SelectItem>
                          {approvers
                            .filter(a => a.id !== profile?.id)
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.full_name || a.email} ({a.role})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleDelegate} disabled={loading} size="sm" variant="outline" className="h-9">
                        Assign
                      </Button>
                    </div>
                  </div>

                  {/* Standard review comments */}
                  <div className="space-y-2">
                    <Label htmlFor="review-comments" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Review Comments</Label>
                    <Textarea
                      id="review-comments"
                      value={actionComments}
                      onChange={(e) => setActionComments(e.target.value)}
                      placeholder="Add approval comments or reasons for declining..."
                      rows={3}
                      className="input-dark text-foreground text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button onClick={() => handleAction('declined')} disabled={loading} variant="destructive" className="w-full text-xs font-semibold">
                      Decline
                    </Button>
                    <Button onClick={() => handleAction('approved')} disabled={loading} className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                      Approve Order
                    </Button>
                  </div>

                  <Button size="sm" variant="ghost" onClick={() => setSelectedReq(null)} className="w-full text-xs mt-2">
                    Cancel Review
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-card border-none bg-slate-900/10 p-6 text-center text-xs text-muted-foreground italic sticky top-20">
                Select a pending requisition ticket from the list to approve, decline, or delegate authority.
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function AdminRequisitionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-muted-foreground">Loading requisitions console...</p>
      </div>
    }>
      <AdminRequisitionsContent />
    </Suspense>
  )
}
