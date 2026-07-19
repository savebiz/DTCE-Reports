'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEvents, Profile, DailyReport, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { DashboardHeader } from '@/components/dashboard-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import localforage from 'localforage'

interface Challenge {
  id: string
  text: string
}

interface Recommendation {
  id: string
  text: string
  linked_challenge_id?: string
}

export default function DepartmentNarrativePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [activeEvent, setActiveEvent] = useState<any>(null)
  
  // Data aggregation states
  const [reports, setReports] = useState<DailyReport[]>([])
  const [aggregatedStats, setAggregatedStats] = useState({
    totalMorningAttendance: 0,
    totalEveningAttendance: 0,
    averageAttendance: 0,
    totalOffering: 0,
    reportingDays: 0,
  })

  // Narrative Form states
  const [narrativeId, setNarrativeId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'submitted' | 'reviewed' | 'approved'>('draft')
  const [overview, setOverview] = useState('')
  const [highlights, setHighlights] = useState('')
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  
  // UI helper states
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(false)

  // 1. Connectivity status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      const goOnline = () => setIsOnline(true)
      const goOffline = () => setIsOnline(false)
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }
  }, [])

  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    const errs: string[] = []
    if (!overview.trim()) {
      errs.push('Overview of Activities must be filled.')
    } else if (overview.trim().length < 20) {
      errs.push('Overview description is too short (minimum 20 characters).')
    }
    if (!highlights.trim()) {
      errs.push('Core Highlights & Key Successes must be filled.')
    } else if (highlights.trim().length < 20) {
      errs.push('Highlights list is too short (minimum 20 characters).')
    }
    if (challenges.some(c => !c.text.trim())) {
      errs.push('One or more challenge details are empty.')
    }
    if (recommendations.some(r => !r.text.trim())) {
      errs.push('One or more recommendation details are empty.')
    }
    setWarnings(errs)
  }, [overview, highlights, challenges, recommendations])

  // 2. Fetch data & aggregate metrics
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
        full_name: meta?.full_name || user.email?.split('@')[0] || 'Department HOD',
        role: meta?.role || 'hod',
        department_id: meta?.department_id || 'dept-10', // Default to Medical
        username: meta?.username || user.email?.split('@')[0] || 'user',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      setProfile(activeProfile)
      
      const dept = mockDepartments.find(d => d.id === activeProfile.department_id)
      if (dept) {
        setDepartment(dept)
      } else {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('*')
          .eq('id', activeProfile.department_id)
          .maybeSingle()
        if (dbDept) setDepartment(dbDept)
      }

      // Fetch active event
      const { data: eventsList } = await supabase.from('events').select('*')
      if (eventsList && eventsList.length > 0) {
        setActiveEvent(eventsList[0])
      }

      // Fetch reports
      const { data: reps } = await supabase.from('daily_reports').select('*')
      const filteredReps = reps ? reps.filter((r: any) => r.department_id === activeProfile.department_id) : []
      setReports(filteredReps)

      // Calculate aggregated metrics
      let totalMorning = 0
      let totalEvening = 0
      let totalOff = 0

      filteredReps.forEach((r: DailyReport) => {
        totalMorning += r.attendance_morning
        totalEvening += r.attendance_evening

        // Calculate offering if stored inside metrics_data (e.g. registration offline mode amount_collected or services offering)
        if (r.metrics_data) {
          // Registration amount_collected
          if (Array.isArray(r.metrics_data.registration_data)) {
            r.metrics_data.registration_data.forEach((reg: any) => {
              totalOff += Number(reg.amount_collected || 0)
            })
          }
          // Ushering services offering
          if (Array.isArray(r.metrics_data.services)) {
            r.metrics_data.services.forEach((srv: any) => {
              totalOff += Number(srv.offering || 0)
            })
          }
        }
      })

      const daysCount = filteredReps.length
      setAggregatedStats({
        totalMorningAttendance: totalMorning,
        totalEveningAttendance: totalEvening,
        averageAttendance: daysCount > 0 ? Math.round((totalMorning + totalEvening) / (daysCount * 2)) : 0,
        totalOffering: totalOff,
        reportingDays: daysCount,
      })

      // Fetch existing End-of-Event narrative
      const { data: narrs } = await supabase
        .from('department_narratives')
        .select('*')
      
      const existingNarr = narrs ? narrs.find((n: any) => n.department_id === prof.department_id && n.is_end_of_event === true) : null

      if (existingNarr) {
        setNarrativeId(existingNarr.id)
        setStatus(existingNarr.status || 'draft')
        setOverview(existingNarr.overview || '')
        setHighlights(existingNarr.highlights || '')
        setChallenges(existingNarr.challenges_json || [])
        setRecommendations(existingNarr.recommendations_json || [])
      } else {
        // Try to load offline draft if exists
        const localDraft = await localforage.getItem<any>(`dtce_narrative_draft_${prof.department_id}`)
        if (localDraft) {
          setOverview(localDraft.overview || '')
          setHighlights(localDraft.highlights || '')
          setChallenges(localDraft.challenges || [])
          setRecommendations(localDraft.recommendations || [])
        }
      }
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // 3. Auto-save narrative draft locally
  useEffect(() => {
    if (profile && department && status === 'draft') {
      localforage.setItem(`dtce_narrative_draft_${profile.department_id}`, {
        overview,
        highlights,
        challenges,
        recommendations
      })
    }
  }, [overview, highlights, challenges, recommendations, profile, department])

  // 4. Challenges List Mutations
  const handleAddChallenge = () => {
    const newChan = {
      id: 'chall-' + Math.random().toString(36).substr(2, 9),
      text: ''
    }
    setChallenges(prev => [...prev, newChan])
  }

  const handleChallengeChange = (id: string, text: string) => {
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, text } : c))
  }

  const handleRemoveChallenge = (id: string) => {
    setChallenges(prev => prev.filter(c => c.id !== id))
    // Also clear links from recommendations
    setRecommendations(prev => prev.map(r => r.linked_challenge_id === id ? { ...r, linked_challenge_id: undefined } : r))
  }

  // 5. Recommendations List Mutations
  const handleAddRecommendation = () => {
    const newRec = {
      id: 'rec-' + Math.random().toString(36).substr(2, 9),
      text: ''
    }
    setRecommendations(prev => [...prev, newRec])
  }

  const handleRecommendationChange = (id: string, text: string) => {
    setRecommendations(prev => prev.map(r => r.id === id ? { ...r, text } : r))
  }

  const handleLinkChallenge = (recId: string, challengeId: string) => {
    setRecommendations(prev => prev.map(r => r.id === recId ? { ...r, linked_challenge_id: challengeId === 'none' ? undefined : challengeId } : r))
  }

  const handleRemoveRecommendation = (id: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== id))
  }

  // 6. Save or Submit to DB
  const handleSave = async (submit = false) => {
    if (!profile || !department || !activeEvent) return

    setLoading(true)
    const supabase = getClient()
    const targetStatus = submit ? 'submitted' : 'draft'

    const payload = {
      event_id: activeEvent.id,
      department_id: department.id,
      is_end_of_event: true,
      status: targetStatus,
      overview,
      highlights,
      challenges_json: challenges,
      recommendations_json: recommendations
    }

    try {
      if (narrativeId) {
        // Update existing record
        const { error } = await supabase
          .from('department_narratives')
          .update(payload)
          .eq('id', narrativeId)
        if (error) throw error
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('department_narratives')
          .insert(payload)
          .select()
        if (error) throw error
        if (data && data.length > 0) {
          setNarrativeId(data[0].id)
        }
      }

      setStatus(targetStatus)
      if (submit) {
        // Clear local storage draft
        await localforage.removeItem(`dtce_narrative_draft_${profile.department_id}`)
        showToast('End-of-Event Narrative submitted successfully!', 'success')
      } else {
        showToast('Draft saved successfully!', 'success')
      }
      loadData()
    } catch (err: any) {
      showToast(`Operation failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const isViewOnly = status === 'submitted' || status === 'approved' || status === 'reviewed'

  return (
    <div className="min-h-screen bg-mesh" style={{ background: 'var(--background)' }}>
      {/* Title block */}
      <div className="border-b" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between py-6 px-4 md:px-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">HOD Summary Submission</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">End-of-Event Narrative Report</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {department?.name} Department • {activeEvent?.name || 'Annual Convention'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full"
              style={
                status === 'draft' ? { background: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' } :
                status === 'submitted' ? { background: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' } :
                { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }
              }
            >
              Status: {status}
            </span>
            <button
              onClick={() => router.push('/my-department')}
              className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all duration-200 text-foreground border border-border bg-card hover:bg-slate-500/5 cursor-pointer"
            >
              ➔ Daily Checklist
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
          
          {/* Left Column: Aggregated Reference Cards (Prose Helper) */}
          <div className="lg:col-span-1 space-y-6">
            <div className="sticky top-20 space-y-6">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                  Event Aggregated Data
                </h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Live references pulled directly from your daily reports to guide your summary prose.
                </p>
              </div>

              {/* Attendance card */}
              <div className="glass-card p-5 bg-card border-border">
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Total Attendance Case</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl p-3.5 bg-background/50 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-0.5">Morning Total</span>
                      <p className="text-xl font-bold font-mono text-foreground">{aggregatedStats.totalMorningAttendance}</p>
                    </div>
                    <div className="rounded-xl p-3.5 bg-background/50 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-0.5">Evening Total</span>
                      <p className="text-xl font-bold font-mono text-foreground">{aggregatedStats.totalEveningAttendance}</p>
                    </div>
                  </div>
                  <div className="pt-3.5 flex justify-between items-center text-[12px] border-t border-border">
                    <span className="text-muted-foreground">Average/Day:</span>
                    <span className="font-bold font-mono text-foreground">{aggregatedStats.averageAttendance}</span>
                  </div>
                </div>
              </div>

              {/* Financial collections (if applicable) */}
              <div className="glass-card p-5 bg-card border-border">
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Financial / Collections</h4>
                <div className="rounded-xl p-4 bg-background/50 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-0.5">Total Offering / Sum</span>
                  <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    <span className="font-sans">₦</span>{aggregatedStats.totalOffering.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Event stats card */}
              <div className="glass-card p-4 text-[12px] space-y-2 bg-card border-border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reporting Days Submitted:</span>
                  <span className="font-bold font-mono text-foreground">{aggregatedStats.reportingDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">First Entry Logged:</span>
                  <span className="font-medium text-muted-foreground/80">{reports.length > 0 ? new Date(reports[0].created_at).toLocaleDateString() : 'None'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Writing/Prose Panel (Coda Editor Style) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6 space-y-6 bg-card border-border">
              
              {/* 1. Overview */}
              <div className="space-y-2">
                <label htmlFor="overview" className="text-[14px] font-bold text-foreground uppercase tracking-wider block">
                  1. Overview of Activities
                </label>
                <p className="text-[12px] text-muted-foreground mb-2">
                  Write a brief, comprehensive summary of your department's operations and tasks during the entire event.
                </p>
                <textarea
                  id="overview"
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                  placeholder="Describe how the department operated, tasks carried out, shift setups, and general workflow..."
                  rows={4}
                  disabled={isViewOnly}
                  className="input-dark text-foreground"
                />
              </div>

              {/* 2. Highlights */}
              <div className="space-y-2">
                <label htmlFor="highlights" className="text-[14px] font-bold text-foreground uppercase tracking-wider block">
                  2. Core Highlights &amp; Key Successes
                </label>
                <p className="text-[12px] text-muted-foreground mb-2">
                  Highlight key milestones, major accomplishments, or moments where your department excelled.
                </p>
                <textarea
                  id="highlights"
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  placeholder="Example: Successfully printed 800 tags, treated all cases without injuries, smoothly distributed meals..."
                  rows={4}
                  disabled={isViewOnly}
                  className="input-dark text-foreground"
                />
              </div>

              {/* 3. Discrete Challenges */}
              <div className="space-y-4 pt-6 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[14px] font-bold text-foreground uppercase tracking-wider block">
                      3. Department Challenges / Issues
                    </span>
                    <p className="text-[12px] text-muted-foreground">
                      Log specific, discrete issues faced during the event (SafetyCulture discrete style).
                    </p>
                  </div>
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={handleAddChallenge}
                      className="h-8 rounded-lg px-3 text-[12px] font-semibold transition-all duration-150 shrink-0 text-foreground border border-border bg-card hover:bg-slate-500/5 cursor-pointer"
                    >
                      + Add Challenge
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {challenges.map((c, index) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-xl p-3 bg-background/30 border border-border">
                      <span className="font-mono text-xs font-bold text-muted-foreground w-6">C{index + 1}</span>
                      <input
                        value={c.text}
                        onChange={(e) => handleChallengeChange(c.id, e.target.value)}
                        placeholder="Describe the challenge briefly..."
                        disabled={isViewOnly}
                        className="input-dark h-9 text-[13px] py-0 flex-1 text-foreground"
                      />
                      {!isViewOnly && (
                        <button
                          type="button"
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={() => handleRemoveChallenge(c.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {challenges.length === 0 && (
                    <p className="text-[12px] text-muted-foreground italic">No challenges logged yet. Click "+ Add Challenge" if applicable.</p>
                  )}
                </div>
              </div>

              {/* 4. Structured Recommendations */}
              <div className="space-y-4 pt-6 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[14px] font-bold text-foreground uppercase tracking-wider block">
                      4. Strategic Recommendations
                    </span>
                    <p className="text-[12px] text-muted-foreground">
                      Map actionable suggestions directly to the challenges logged above.
                    </p>
                  </div>
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={handleAddRecommendation}
                      className="h-8 rounded-lg px-3 text-[12px] font-semibold transition-all duration-150 shrink-0 text-foreground border border-border bg-card hover:bg-slate-500/5 cursor-pointer"
                    >
                      + Add Recommendation
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {recommendations.map((r, index) => (
                    <div key={r.id} className="space-y-3 rounded-xl p-4 bg-background/30 border border-border">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold text-muted-foreground">R{index + 1}</span>
                        {!isViewOnly && (
                          <button
                            type="button"
                            className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-550 transition-colors"
                            onClick={() => handleRemoveRecommendation(r.id)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      
                      <input
                        value={r.text}
                        onChange={(e) => handleRecommendationChange(r.id, e.target.value)}
                        placeholder="Describe your suggestion / action plan..."
                        disabled={isViewOnly}
                        className="input-dark h-9 text-[13px] py-0 text-foreground"
                      />

                      {/* Linked challenge dropdown */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Linked Challenge:</span>
                        {isViewOnly ? (
                          <span className="text-[12px] font-semibold text-foreground">
                            {r.linked_challenge_id
                              ? `C${challenges.findIndex(c => c.id === r.linked_challenge_id) + 1}: ${challenges.find(c => c.id === r.linked_challenge_id)?.text}`
                              : 'None'}
                          </span>
                        ) : (
                          <select
                            value={r.linked_challenge_id || 'none'}
                            onChange={(e) => handleLinkChallenge(r.id as string, e.target.value)}
                            className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-foreground bg-card border border-border cursor-pointer outline-none"
                          >
                            <option value="none">None</option>
                            {challenges.map((c, cIdx) => (
                              <option key={c.id} value={c.id}>
                                C{cIdx + 1}: {c.text.substring(0, 30)}...
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                  {recommendations.length === 0 && (
                    <p className="text-[12px] text-muted-foreground italic">No recommendations logged yet. Click "+ Add Recommendation" to begin.</p>
                  )}
                </div>
              </div>

              {/* Validation Warnings (Task 8) */}
              {!isViewOnly && warnings.length > 0 && (
                <div className="rounded-xl p-4 text-[12px] space-y-1.5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#D97706' }}>
                  <span className="font-bold uppercase tracking-wider block">⚠️ Gating Requirements</span>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Footer actions inside editor card */}
              <div className="flex justify-end gap-2 pt-5 border-t border-border">
                {!isViewOnly ? (
                  <>
                    <button
                      onClick={() => handleSave(false)}
                      disabled={loading}
                      className="h-9 rounded-lg px-4 text-[12px] font-semibold text-foreground bg-card border border-border transition-all cursor-pointer hover:bg-slate-500/5"
                    >
                      Save Draft
                    </button>
                    <button
                      onClick={() => handleSave(true)}
                      disabled={loading || warnings.length > 0}
                      className="h-9 rounded-lg px-4 text-[12px] font-bold text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: warnings.length > 0 ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.15)', border: warnings.length > 0 ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(16,185,129,0.3)', color: warnings.length > 0 ? '#64748B' : '#34D399' }}
                    >
                      Submit Narrative Report
                    </button>
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground italic">
                    Narrative is {status} and cannot be modified. Contact Secretariat to re-open draft.
                  </p>
                )}
              </div>

            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
