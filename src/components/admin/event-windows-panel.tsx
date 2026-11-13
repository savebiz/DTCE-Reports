'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { showToast } from '@/components/ui/toast'
import { Switch } from '@/components/ui/switch'
import { Calendar, Clock, Lock, Unlock, CheckCircle2, AlertTriangle, Plus, Globe2, CalendarCheck2 } from 'lucide-react'
import type { PlatformEvent, EventStatus, EventType, WindowOverride } from '@/lib/events/current-event'
import {
  evaluateRequisitionWindow,
  formatWatDateTime,
  fromWatInputValue,
  getDefaultLiveRequisitionOpensAt,
  toWatInputValue,
} from '@/lib/events/requisition-windows'
import { ModernSelect } from '@/components/ui/modern-select'

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

  // New event creator state
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<EventType>('congress')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newMakeActive, setNewMakeActive] = useState(true)

  const loadEvents = async (preferId?: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/events')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load events')
      const list: PlatformEvent[] = data.events || []
      setEvents(list)
      const target =
        (preferId && list.find(e => e.id === preferId)) ||
        list.find(e => e.is_current) ||
        list[0]
      if (target) {
        selectEvent(target)
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

  const activePlatformEvent = events.find(e => e.is_current) || null
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
          : `Saved configuration for ${selectedEvent.name}.`,
        'success'
      )
      await loadEvents(selectedEvent.id)
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      showToast('Please enter an event name.', 'warning')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          event_type: newType,
          start_date: newStart || null,
          end_date: newEnd || null,
          set_as_current: newMakeActive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create event')
      showToast(`Created event "${data.event?.name || newName}"`, 'success')
      setNewName('')
      setNewStart('')
      setNewEnd('')
      setShowCreate(false)
      await loadEvents(data.event?.id)
    } catch (err: any) {
      showToast(err.message || 'Failed to create event', 'error')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <Card className="glass-card border-none">
        <CardContent className="p-6 text-xs text-muted-foreground">Loading platform event configurations...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* ── CARD 1: ACTIVE PLATFORM EVENT SELECTOR ── */}
      <Card className="glass-card border-none">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-emerald-500" />
              Active Platform Event
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose which event all Daily Logs, Dashboards, Store Requisitions, and Exports are currently operating on.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowCreate(v => !v)}
            className="text-xs h-9 font-bold shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {showCreate ? 'Close' : 'New Event'}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {activePlatformEvent ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="space-y-0.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Currently Active Across Platform
                </span>
                <p className="text-sm font-bold text-foreground">{activePlatformEvent.name}</p>
                <p className="text-xs text-muted-foreground">
                  {activePlatformEvent.start_date && activePlatformEvent.end_date
                    ? `${activePlatformEvent.start_date.slice(0, 10)} → ${activePlatformEvent.end_date.slice(0, 10)}`
                    : 'Dates not yet configured'}{' '}
                  · Status: <span className="font-semibold capitalize">{activePlatformEvent.status || 'planning'}</span>
                </p>
              </div>
              {events.length > 1 && (
                <div className="flex flex-col sm:items-end gap-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Switch / Configure Event</Label>
                  <ModernSelect
                    value={selectedId}
                    onChange={(e) => {
                      const found = events.find(ev => ev.id === e.target.value)
                      if (found) selectEvent(found)
                    }}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground"
                  >
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name} {ev.is_current ? '(Active)' : `(${ev.status || 'planning'})`}
                      </option>
                    ))}
                  </ModernSelect>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-300">
              No active event is currently flagged. Select or create an event below and click &ldquo;Save &amp; Set as Active Event&rdquo;.
            </div>
          )}

          {/* Create New Event Inline Form */}
          {showCreate && (
            <form onSubmit={handleCreateEvent} className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">Create New Platform Event</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Event Name</Label>
                  <Input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Holy Ghost Congress 2026"
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Event Type</Label>
                  <ModernSelect
                    value={newType}
                    onChange={e => setNewType(e.target.value as EventType)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="congress">Congress</option>
                    <option value="convention">Convention</option>
                    <option value="other">Special Event</option>
                  </ModernSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End Date</Label>
                  <Input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="h-9 text-xs" />
                </div>
                <div className="flex items-end sm:col-span-2">
                  <div className="inline-flex items-center gap-2.5 text-xs font-medium text-foreground h-9">
                    <Switch
                      id="new-make-active"
                      checked={newMakeActive}
                      onCheckedChange={setNewMakeActive}
                      aria-label="Set as active platform event immediately"
                    />
                    <label htmlFor="new-make-active" className="cursor-pointer select-none">
                      Set as active platform event immediately
                    </label>
                  </div>
                </div>
                <div className="flex items-end justify-end">
                  <Button type="submit" size="sm" disabled={creating} className="h-9 text-xs font-bold">
                    {creating ? 'Creating...' : 'Create Event'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ── CARD 2: PLATFORM LIFECYCLE, DAILY REPORTING & STORES WINDOWS ── */}
      <Card className="glass-card border-none">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              Platform Event &amp; Operations Windows
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure event dates, Daily Log submission gating, Pre-Event Needs Lists, and Live Store Requisitions (WAT / UTC+1).
            </p>
          </div>
          {events.length > 0 && (
            <ModernSelect
              value={selectedId}
              onChange={(e) => {
                const found = events.find(ev => ev.id === e.target.value)
                if (found) selectEvent(found)
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground"
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} {ev.is_current ? '(Active)' : `(${ev.status || 'planning'})`}
                </option>
              ))}
            </ModernSelect>
          )}
        </CardHeader>

        {selectedEvent && draft && (
          <CardContent className="space-y-6">
            {/* Live Preview Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Daily Reporting
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    <CalendarCheck2 className="w-3 h-3" />
                    Day-Gated
                  </span>
                </div>
                <p className="text-xs text-foreground font-medium">
                  Each event day opens for final submission 6 hours before midnight (18:00 WAT the evening before). Drafts remain available anytime.
                </p>
              </div>

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
                    Phase 2: Live Store Requisition
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
                <ModernSelect
                  value={draft.status}
                  onChange={e => setDraft({ ...draft, status: e.target.value as EventStatus })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <option value="planning">Planning</option>
                  <option value="requisition_open">Requisition Open (Pre-Event)</option>
                  <option value="live">Live Event</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                </ModernSelect>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <ModernSelect
                    value={draft.pre_event_override}
                    onChange={e => setDraft({ ...draft, pre_event_override: e.target.value as WindowOverride })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="auto">Auto (Follow Schedule)</option>
                    <option value="force_open">Force Open (Override)</option>
                    <option value="force_closed">Force Closed (Lock)</option>
                  </ModernSelect>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <ModernSelect
                    value={draft.live_requisition_override}
                    onChange={e => setDraft({ ...draft, live_requisition_override: e.target.value as WindowOverride })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="auto">Auto (Unlock 1 Day Before Event)</option>
                    <option value="force_open">Force Open (Testing / Early Access)</option>
                    <option value="force_closed">Force Closed (Lock)</option>
                  </ModernSelect>
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
