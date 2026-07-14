'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEvents, Profile, DailyReport, Department } from '@/utils/supabase'
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

    if (prof) {
      setProfile(prof)
      
      const dept = mockDepartments.find(d => d.id === prof.department_id)
      if (dept) setDepartment(dept)

      // Fetch active event
      const { data: eventsList } = await supabase.from('events').select('*')
      if (eventsList && eventsList.length > 0) {
        setActiveEvent(eventsList[0])
      }

      // Fetch reports
      const { data: reps } = await supabase.from('daily_reports').select('*')
      const filteredReps = reps ? reps.filter((r: any) => r.department_id === prof.department_id) : []
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
        alert('End-of-Event Narrative submitted successfully!')
      } else {
        alert('Draft saved successfully!')
      }
      loadData()
    } catch (err: any) {
      alert(`Operation failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const isViewOnly = status === 'submitted' || status === 'approved' || status === 'reviewed'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <DashboardHeader />

      {/* Title block */}
      <div className="bg-white border-b border-slate-200 dark:bg-slate-950 dark:border-slate-800 py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              End-of-Event Narrative Report
            </h1>
            <p className="text-sm text-slate-500">
              {department?.name} Department • {activeEvent?.name || 'Annual Convention'}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold capitalize ${
              status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
              status === 'submitted' ? 'bg-blue-100 text-blue-800' :
              'bg-green-100 text-green-800'
            }`}>
              Status: {status}
            </span>
            <Button variant="outline" size="sm" onClick={() => router.push('/my-department')}>
              ➔ Daily Checklist
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Two column grid Coda-style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Aggregated Reference Cards (Prose Helper) */}
          <div className="lg:col-span-1 space-y-6">
            <div className="sticky top-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Event Aggregated Data
                </h3>
                <p className="text-xs text-slate-500">
                  Coda-style live references pulled directly from your daily reports to guide your summary prose.
                </p>
              </div>

              {/* Attendance card */}
              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase text-slate-400">Total Attendance Case</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Morning Total</span>
                      <p className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">{aggregatedStats.totalMorningAttendance}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Evening Total</span>
                      <p className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">{aggregatedStats.totalEveningAttendance}</p>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
                    <span className="text-slate-500">Average/Day:</span>
                    <span className="font-bold font-mono">{aggregatedStats.averageAttendance}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Financial collections (if applicable) */}
              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase text-slate-400">Financial / Collections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Total Offering / Sum</span>
                    <p className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                      ₦{aggregatedStats.totalOffering.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Event stats card */}
              <Card className="border-slate-200 dark:border-slate-800 bg-slate-100/50">
                <CardContent className="p-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reporting Days Submitted:</span>
                    <span className="font-bold font-mono">{aggregatedStats.reportingDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">First Entry Logged:</span>
                    <span className="font-bold">{reports.length > 0 ? new Date(reports[0].created_at).toLocaleDateString() : 'None'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Column: Writing/Prose Panel (Coda Editor Style) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-lg dark:border-slate-800">
              <CardContent className="p-6 space-y-8">
                
                {/* 1. Overview */}
                <div className="space-y-2">
                  <Label htmlFor="overview" className="text-base font-bold text-slate-800 dark:text-slate-200">
                    1. Overview of Activities
                  </Label>
                  <p className="text-xs text-slate-500 mb-2">
                    Write a brief, comprehensive summary of your department's operations and tasks during the entire event.
                  </p>
                  <Textarea
                    id="overview"
                    value={overview}
                    onChange={(e) => setOverview(e.target.value)}
                    placeholder="Describe how the department operated, tasks carried out, shift setups, and general workflow..."
                    rows={4}
                    disabled={isViewOnly}
                    className="text-sm shadow-sm"
                  />
                </div>

                {/* 2. Highlights */}
                <div className="space-y-2">
                  <Label htmlFor="highlights" className="text-base font-bold text-slate-800 dark:text-slate-200">
                    2. Core Highlights & Key Successes
                  </Label>
                  <p className="text-xs text-slate-500 mb-2">
                    Highlight key milestones, major accomplishments, or moments where your department excelled.
                  </p>
                  <Textarea
                    id="highlights"
                    value={highlights}
                    onChange={(e) => setHighlights(e.target.value)}
                    placeholder="Example: Successfully printed 800 tags, treated all cases without injuries, smoothly distributed meals..."
                    rows={4}
                    disabled={isViewOnly}
                    className="text-sm shadow-sm"
                  />
                </div>

                {/* 3. Discrete Challenges */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-bold text-slate-800 dark:text-slate-200">
                        3. Department Challenges / Issues
                      </Label>
                      <p className="text-xs text-slate-500">
                        Log specific, discrete issues faced during the event (SafetyCulture discrete style).
                      </p>
                    </div>
                    {!isViewOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={handleAddChallenge}>
                        + Add Challenge
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {challenges.map((c, index) => (
                      <div key={c.id} className="flex items-center space-x-2 bg-slate-50 p-3 rounded-md border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
                        <span className="font-mono text-xs font-bold text-slate-400">C{index + 1}</span>
                        <Input
                          value={c.text}
                          onChange={(e) => handleChallengeChange(c.id, e.target.value)}
                          placeholder="Describe the challenge briefly..."
                          disabled={isViewOnly}
                          className="h-9 text-sm bg-white"
                        />
                        {!isViewOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:bg-red-50"
                            onClick={() => handleRemoveChallenge(c.id)}
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    ))}
                    {challenges.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No challenges logged yet. Click "+ Add Challenge" if applicable.</p>
                    )}
                  </div>
                </div>

                {/* 4. Structured Recommendations */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-bold text-slate-800 dark:text-slate-200">
                        4. Strategic Recommendations
                      </Label>
                      <p className="text-xs text-slate-500">
                        Map actionable suggestions directly to the challenges logged above.
                      </p>
                    </div>
                    {!isViewOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={handleAddRecommendation}>
                        + Add Recommendation
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {recommendations.map((r, index) => (
                      <div key={r.id} className="space-y-2 bg-slate-50 p-4 rounded-md border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs font-bold text-slate-400">R{index + 1}</span>
                          {!isViewOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:bg-red-50"
                              onClick={() => handleRemoveRecommendation(r.id)}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                        
                        <Input
                          value={r.text}
                          onChange={(e) => handleRecommendationChange(r.id, e.target.value)}
                          placeholder="Describe your suggestion / action plan..."
                          disabled={isViewOnly}
                          className="h-9 text-sm bg-white"
                        />

                        {/* Linked challenge dropdown */}
                        <div className="flex items-center space-x-2 pt-1">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Linked Challenge:</span>
                          {isViewOnly ? (
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {r.linked_challenge_id
                                ? `C${challenges.findIndex(c => c.id === r.linked_challenge_id) + 1}: ${challenges.find(c => c.id === r.linked_challenge_id)?.text}`
                                : 'None'}
                            </span>
                          ) : (
                            <Select
                              value={r.linked_challenge_id || 'none'}
                              onValueChange={(val: string | null) => handleLinkChallenge(r.id as string, val || 'none')}
                            >
                              <SelectTrigger className="h-7 w-64 text-xs bg-white">
                                <SelectValue placeholder="Link to a challenge..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {challenges.map((c, cIdx) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    C{cIdx + 1}: {c.text.substring(0, 30)}...
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    ))}
                    {recommendations.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No recommendations logged yet. Click "+ Add Recommendation" to begin.</p>
                    )}
                  </div>
                </div>

              </CardContent>
              
              <CardFooter className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-6">
                {!isViewOnly ? (
                  <>
                    <Button variant="outline" onClick={() => handleSave(false)} disabled={loading}>
                      Save Draft
                    </Button>
                    <Button onClick={() => handleSave(true)} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
                      Submit Narrative Report
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Narrative is {status} and cannot be modified. Contact Secretariat to re-open draft.
                  </p>
                )}
              </CardFooter>
            </Card>
          </div>

        </div>
      </main>
    </div>
  )
}
