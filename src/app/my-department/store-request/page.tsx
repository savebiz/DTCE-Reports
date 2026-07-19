'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { DashboardHeader } from '@/components/dashboard-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  assigned_approver?: {
    full_name: string
    email: string
  }
}

function StoreRequestContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeEvent, setActiveEvent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<StoreRequestTicket[]>([])

  // New Request Form State
  const [items, setItems] = useState<RequestItem[]>([])
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState(1)
  const [itemCategory, setItemCategory] = useState<'durable' | 'consumable'>('consumable')

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
    
    // Fallback assignment lookup if department_id is missing
    if (!activeProfile.department_id && !isMock) {
      const { data: assignment } = await supabase
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', activeProfile.id)
        .maybeSingle()
      if (assignment) {
        activeProfile.department_id = assignment.department_id
      }
    }
    setProfile(activeProfile)

    // Fetch active event
    const { data: events } = await supabase.from('events').select('*')
    if (events && events.length > 0) {
      setActiveEvent(events[0])
    }

    // Fetch requests
    if (!isMock) {
      const { data: reqsData } = await supabase
        .from('store_requests')
        .select(`
          id,
          items_json,
          status,
          reviewer_comments,
          reviewed_at,
          created_at,
          assigned_approver_id
        `)
        .eq('requester_profile_id', activeProfile.id)
        .order('created_at', { ascending: false })

      // Fetch dynamic delegated approver names
      if (reqsData) {
        const enhancedReqs = await Promise.all(
          reqsData.map(async (r: any) => {
            if (r.assigned_approver_id) {
              const { data: appData } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', r.assigned_approver_id)
                .maybeSingle()
              if (appData) {
                return { ...r, assigned_approver: appData }
              }
            }
            return r
          })
        )
        setRequests(enhancedReqs)
      }
    } else {
      // Mock requests
      setRequests([
        {
          id: 'req-mock-1',
          items_json: [{ name: 'Analgesics', quantity: 200, category: 'consumable' }],
          status: 'approved',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          reviewer_comments: 'Approved for urgent medical deck support.'
        }
      ])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddItem = () => {
    if (!itemName.trim()) {
      showToast('Item name cannot be empty', 'error')
      return
    }
    const newItem: RequestItem = {
      name: itemName.trim(),
      quantity: Math.max(1, itemQty),
      category: itemCategory
    }
    setItems(prev => [...prev, newItem])
    setItemName('')
    setItemQty(1)
  }

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmitRequest = async () => {
    if (items.length === 0) {
      showToast('Please add at least one item to the request', 'error')
      return
    }
    if (!profile || !profile.department_id || !activeEvent) {
      showToast('Failed to resolve department or event context', 'error')
      return
    }

    setLoading(true)
    const supabase = getClient()

    if (isMock) {
      showToast('Mock request logged locally', 'success')
      setRequests(prev => [
        {
          id: 'req-mock-' + Math.random().toString(36).substr(2, 9),
          items_json: items,
          status: 'pending_coordinator',
          created_at: new Date().toISOString()
        },
        ...prev
      ])
      setItems([])
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.from('store_requests').insert({
        requester_profile_id: profile.id,
        department_id: profile.department_id,
        event_id: activeEvent.id,
        items_json: items,
        status: 'pending_coordinator'
      })

      if (error) throw error

      showToast('Material Requisition submitted to National Coordinator!', 'success')
      setItems([])
      loadData()
    } catch (err: any) {
      showToast(`Failed to submit request: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <DashboardHeader />
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Stores Requisition Portal</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submit material requests to the National Coordinator for approval and Stores fulfillment.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Request Column */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="glass-card border-none">
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                  Create Requisition List
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="item-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Item Name</Label>
                  <Input
                    id="item-name"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Mattresses, Stationery, Packets of rice"
                    className="input-dark text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-qty" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Quantity</Label>
                    <Input
                      id="item-qty"
                      type="number"
                      value={itemQty}
                      onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-dark text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item-cat" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Category</Label>
                    <Select
                      value={itemCategory}
                      onValueChange={(val: any) => setItemCategory(val)}
                    >
                      <SelectTrigger id="item-cat" className="h-10 text-foreground bg-card border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consumable">Consumable</SelectItem>
                        <SelectItem value="durable">Durable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleAddItem} className="w-full text-xs font-semibold" variant="outline">
                  + Add to Request List
                </Button>

                {/* Selected items array */}
                {items.length > 0 && (
                  <div className="pt-4 border-t border-border space-y-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Items Added:</span>
                    <ul className="space-y-2">
                      {items.map((it, idx) => (
                        <li key={idx} className="flex justify-between items-center bg-background/40 border border-border p-2 rounded-lg text-xs text-foreground">
                          <div>
                            <span className="font-bold">{it.name}</span>
                            <span className="text-[10px] text-muted-foreground block capitalize">{it.category} • Qty {it.quantity}</span>
                          </div>
                          <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-400 font-semibold px-2">
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Button onClick={handleSubmitRequest} disabled={loading} className="w-full mt-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                      {loading ? 'Submitting...' : 'Submit Requisition Plan'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Request History Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card border-none">
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                  Requisition History &amp; Status Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {requests.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No requisitions submitted yet.</p>
                ) : (
                  <div className="space-y-4">
                    {requests.map((req) => (
                      <div key={req.id} className="border border-border rounded-xl p-4 space-y-3 bg-background/25">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] font-semibold text-muted-foreground block">Requested on {new Date(req.created_at).toLocaleDateString()}</span>
                            <span className="text-[11px] font-mono text-muted-foreground block uppercase mt-0.5">ID: {req.id.substring(0, 8)}</span>
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
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Requisition Ledger:</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            {req.items_json.map((it, itIdx) => (
                              <div key={itIdx} className="flex justify-between border-b border-border/40 pb-1">
                                <span className="text-foreground font-medium">{it.name} <span className="text-[10px] text-muted-foreground capitalize">({it.category})</span></span>
                                <span className="font-bold text-foreground font-mono">x {it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Delegation info */}
                        {req.assigned_approver && (
                          <div className="text-[11px] text-muted-foreground flex gap-1.5 items-center">
                            <span>➡️</span>
                            <span>Delegated to review by: <strong>{req.assigned_approver.full_name || req.assigned_approver.email}</strong></span>
                          </div>
                        )}

                        {/* Comments */}
                        {req.reviewer_comments && (
                          <div className="rounded-lg p-3 text-[11px] space-y-1 bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400">
                            <span className="font-bold uppercase tracking-wider block">Reviewer Remarks:</span>
                            <p className="leading-relaxed">{req.reviewer_comments}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function StoreRequestPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-muted-foreground">Loading Store Requisitions Portal...</p>
      </div>
    }>
      <StoreRequestContent />
    </Suspense>
  )
}
