'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { showToast } from '@/components/ui/toast'
import { Calendar, Clock, Lock, Unlock, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { PlatformEvent, EventStatus, WindowOverride } from '@/lib/events/current-event'
import {
  evaluateRequisitionWindow,
  formatWatDateTime,
  fromWatInputValue,
  getDefaultLiveRequisitionOpensAt,
  toWatInputValue,
} from '@/lib/events/requisition-windows'

interface DraftEventState {
  start_date: string
  end_date: string
  status: EventStatus
  requisition_opens_at: string
  requisition_closes_at: string
  live_requisition_opens_at: string
  pre_event_override: WindowOverride
  live_requisition_override: WindowOverride
}

export function EventWindowsPanel() {
  const [events, setEvents] = useState<PlatformEvent[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [draft, setDraft] = useState<DraftEventState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadEvents = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/events')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load events')
      const list: PlatformEvent[] = data.events || []
      setEvents(list)
      const current = list.find(e => e.is_current) || list[0]
      if (current) {
        selectEvent(current)
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load events', 'error')
    } finally {
      setLoading(false)
    }
  }

  const selectEvent = (ev: PlatformEvent) => {
    setSelectedId(ev.id)
    setDraft({
      start_date: ev.start_date ? ev.start_date.slice(0, 10) : '',
      end_date: ev.end_date ? ev.end_date.slice(0, 10) : '',
      status: (ev.status || 'planning') as EventStatus,
      requisition_opens_at: toWatInputValue(ev.requisition_opens_at),
      requisition_closes_at: toWatInputValue(ev.requisition_closes_at),
      live_requisition_opens_at: toWatInputValue(ev.live_requisition_opens_at),
      pre_event_override: (ev.pre_event_override || 'auto') as WindowOverride,
      live_requisition_override: (ev.live_requisition_override || 'auto') as WindowOverride,
    })
  }

  useEffect(() => {
    loadEvents()
  }, [])

  const selectedEvent = events.find(e => e.id === selectedId) || null

  const previewEvent: PlatformEvent | null =
    selectedEvent && draft
      ? {
          ...selectedEvent,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          status: draft.status,
          requisition_opens_at: fromWatInputValue(draft.requisition_opens_at),
          requisition_closes_at: fromWatInputValue(draft.requisition_closes_at),
          live_requisition_opens_at: fromWatInputValue(draft.live_requisition_opens_at),
          pre_event_override: draft.pre_event_override,
          live_requisition_override: draft.live_requisition_override,
        }
      : null

  const preEventWindow = evaluateRequisitionWindow(previewEvent, 'pre_event')
  const liveWindow = evaluateRequisitionWindow(previewEvent, 'during_event')
  const defaultLiveOpen = getDefaultLiveRequisitionOpensAt(previewEvent)

  const handleSave = async (makeCurrent = false) => {
    if (!selectedEvent || !draft) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          status: draft.status,
          requisition_opens_at: fromWatInputValue(draft.requisition_opens_at),
          requisition_closes_at: fromWatInputValue(draft.requisition_closes_at),
          live_requisition_opens_at: fromWatInputValue(draft.live_requisition_opens_at),
          pre_event_override: draft.pre_event_override,
          live_requisition_override: draft.live_requisition_override,
          set_as_current: makeCurrent ? true : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save event settings')
      showToast(
        makeCurrent
          ? `${selectedEvent.name} is now the active platform event.`
          : `Saved window configuration for ${selectedEvent.name}.`,
        'success'
      )
      await loadEvents()
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="glass-card border-none">
        <CardContent className="p-6 text-xs text-muted-foreground">Loading event configurations...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Card className="glass-card border-none">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              Event Lifecycle &amp; Store Requisition Windows
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control when HODs can submit Pre-Event Needs Lists (for market purchase) and when Live Event Store Requisitions unlock (defaults to 1 day before event start, WAT / UTC+1).
            </p>
          </div>
          {events.length > 0 && (
            <select
              value={selectedId}
              onChange={(e) => {
                const found = events.find(ev => ev.id === e.target.value)
                if (found) selectEvent(found)
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground"
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} {ev.is_current ? '(Active)' : `(${ev.status})`}
                </option>
              ))}
            </select>
          )}
        </CardHeader>

        {selectedEvent && draft && (
          <CardContent className="space-y-6">
            {/* Live Preview Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border ${preEventWindow.isOpen ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Phase 1: Pre-Event Needs List
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${preEventWindow.isOpen ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
                    {preEventWindow.isOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {preEventWindow.isOpen ? 'Open' : 'Locked'}
                  </span>
                </div>
                <p className="text-xs text-foreground font-medium">{preEventWindow.message}</p>
              </div>

              <div className={`p-4 rounded-xl border ${liveWindow.isOpen ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-500/30 bg-muted/20'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Phase 2: Live Event Store Requisition
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${liveWindow.isOpen ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-500/20 text-muted-foreground'}`}>
                    {liveWindow.isOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {liveWindow.isOpen ? 'Open' : 'Locked'}
                  </span>
                </div>
                <p className="text-xs text-foreground font-medium">{liveWindow.message}</p>
              </div>
            </div>

            {/* Event Core Dates & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Event Start Date</Label>
                <Input
                  type="date"
                  value={draft.start_date}
                  onChange={e => setDraft({ ...draft, start_date: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Event End Date</Label>
                <Input
                  type="date"
                  value={draft.end_date}
                  onChange={e => setDraft({ ...draft, end_date: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Event Lifecycle Status</Label>
                <select
                  value={draft.status}
                  onChange={e => setDraft({ ...draft, status: e.target.value as EventStatus })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <option value="planning">Planning</option>
                  <option value="requisition_open">Requisition Open (Pre-Event)</option>
                  <option value="live">Live Event</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {/* Phase 1 Window */}
            <div className="p-4 rounded-xl border border-border/60 bg-background/40 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  Phase 1: Pre-Event Needs List Window (WAT / UTC+1)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Opens At (WAT)</Label>
                  <Input
                    type="datetime-local"
                    value={draft.requisition_opens_at}
                    onChange={e => setDraft({ ...draft, requisition_opens_at: e.target.value })}
                    className="text-xs h-9"
                  />
                  <span className="text-[10px] text-muted-foreground block">Leave blank to open immediately.</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Closes At (WAT)</Label>
                  <Input
                    type="datetime-local"
                    value={draft.requisition_closes_at}
                    onChange={e => setDraft({ ...draft, requisition_closes_at: e.target.value })}
                    className="text-xs h-9"
                  />
                  <span className="text-[10px] text-muted-foreground block">Deadline for departments before market trip.</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Manual Override</Label>
                  <select
                    value={draft.pre_event_override}
                    onChange={e => setDraft({ ...draft, pre_event_override: e.target.value as WindowOverride })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="auto">Auto (Follow Schedule)</option>
                    <option value="force_open">Force Open (Override)</option>
                    <option value="force_closed">Force Closed (Lock)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Phase 2 Window */}
            <div className="p-4 rounded-xl border border-border/60 bg-background/40 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Phase 2: Live Event Store Requisition Window (WAT / UTC+1)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Custom Unlock Time (Optional — WAT)</Label>
                  <Input
                    type="datetime-local"
                    value={draft.live_requisition_opens_at}
                    onChange={e => setDraft({ ...draft, live_requisition_opens_at: e.target.value })}
                    className="text-xs h-9"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Leave blank to auto-unlock 1 day before start date ({defaultLiveOpen ? formatWatDateTime(defaultLiveOpen) : 'set Start Date'}).
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Manual Override</Label>
                  <select
                    value={draft.live_requisition_override}
                    onChange={e => setDraft({ ...draft, live_requisition_override: e.target.value as WindowOverride })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="auto">Auto (Unlock 1 Day Before Event)</option>
                    <option value="force_open">Force Open (Testing / Early Access)</option>
                    <option value="force_closed">Force Closed (Lock)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedEvent.is_current ? (
                  <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Currently Active Event
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-500 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" /> Not the active platform event
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!selectedEvent.is_current && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => handleSave(true)}
                    className="text-xs h-9 font-bold border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                  >
                    Save &amp; Set as Active Event
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => handleSave(false)}
                  className="text-xs h-9 font-bold bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {saving ? 'Saving...' : 'Save Event & Window Settings'}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
