'use client'

import React, { useState, useEffect } from 'react'
import { getClient, isMock } from '@/utils/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { showToast } from '@/components/ui/toast'
import { Globe, Save, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { getCurrentEventId } from '@/lib/events/current-event'
import { preEventTotalsFromDepartmentSchema } from '@/lib/events/pre-event-totals'

export interface PreEventCategoryTotal {
  category: 'teachers' | 'teens' | 'pre_teens' | 'children'
  label: string
  total_online_registered: number
}

const CATEGORY_CONFIG: { key: 'teachers' | 'teens' | 'pre_teens' | 'children'; label: string }[] = [
  { key: 'teachers', label: 'Teachers' },
  { key: 'teens', label: 'Teens' },
  { key: 'pre_teens', label: 'Pre-teens' },
  { key: 'children', label: 'Children' }
]

interface PreEventTotalsModalProps {
  eventId?: string
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  userRole?: string
}

export function PreEventRegistrationTotalsModal({
  eventId,
  isOpen,
  onClose,
  onSaved,
  userRole
}: PreEventTotalsModalProps) {
  const [totals, setTotals] = useState<Record<string, number>>({
    teachers: 0,
    teens: 0,
    pre_teens: 0,
    children: 0
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadPreEventTotals = async () => {
    setLoading(true)
    const supabase = getClient()

    try {
      let loaded = false
      if (!isMock) {
        // Find active event ID if not passed
        let activeEventId: string | null | undefined = eventId
        if (!activeEventId) {
          activeEventId = await getCurrentEventId(supabase)
        }

        if (activeEventId) {
          const { data, error } = await supabase
            .from('registration_pre_event_totals')
            .select('category, total_online_registered')
            .eq('event_id', activeEventId)

          if (!error && data && data.length > 0) {
            const map: Record<string, number> = { teachers: 0, teens: 0, pre_teens: 0, children: 0 }
            data.forEach((item: any) => {
              map[item.category] = item.total_online_registered || 0
            })
            setTotals(map)
            loaded = true
          }
        }

        if (!loaded) {
          const { data: depts } = await supabase.from('departments').select('id, name, default_metrics_schema')
          const regDept = (depts || []).find((d: any) => d.name && d.name.toLowerCase().includes('registration'))
          const mirrored = preEventTotalsFromDepartmentSchema(regDept?.default_metrics_schema, activeEventId)
          if (mirrored) {
            setTotals(mirrored)
            loaded = true
          }
        }
      }

      if (!loaded) {
        const savedMock = localStorage.getItem('dtce_mock_pre_event_totals') || localStorage.getItem('dtce_pre_event_totals')
        if (savedMock) {
          setTotals(JSON.parse(savedMock))
        }
      }
    } catch (err) {
      console.warn('Failed to load pre-event totals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadPreEventTotals()
    }
  }, [isOpen, eventId])

  if (!isOpen || userRole !== 'super_admin') return null

  const handleSave = async () => {
    setSaving(true)

    try {
      const res = await fetch('/api/save-pre-event-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totals, userRole })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save pre-event totals')
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('dtce_pre_event_totals', JSON.stringify(totals))
      }

      showToast('Pre-event online registration totals saved to database successfully!', 'success')
      if (onSaved) onSaved()
      onClose()
    } catch (err: any) {
      console.error('Error saving pre-event totals:', err)
      showToast(`Failed to save pre-event totals: ${err.message || 'Database error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const grandTotal = Object.values(totals).reduce((sum, val) => sum + (Number(val) || 0), 0)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 dark:bg-slate-950/80 backdrop-blur-md animate-fade-in-up"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="w-full max-w-lg bg-card border border-blue-500/40 text-foreground shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3 border-b border-border">
          <div>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Pre-Event Online Registration Totals
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter total online registered delegates prior to event start for pickup rate analysis.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <p className="text-xs font-mono text-muted-foreground animate-pulse py-4 text-center">
              Loading pre-event online totals...
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORY_CONFIG.map(cat => (
                  <div key={cat.key} className="p-3 rounded-xl bg-muted/50 border border-border space-y-1.5">
                    <Label htmlFor={`cat-${cat.key}`} className="text-xs font-semibold text-foreground">
                      {cat.label}
                    </Label>
                    <Input
                      id={`cat-${cat.key}`}
                      type="number"
                      min={0}
                      value={totals[cat.key] ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0
                        setTotals(prev => ({ ...prev, [cat.key]: val }))
                      }}
                      className="bg-background border-border text-foreground font-mono text-sm h-9"
                    />
                  </div>
                ))}
              </div>

              {/* Total Summary */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                  Total Online Registered (All Categories):
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                  {grandTotal.toLocaleString()}
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="text-xs h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs h-9 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xs"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? 'Saving...' : 'Save Totals'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
