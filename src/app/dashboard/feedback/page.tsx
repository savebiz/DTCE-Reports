'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, mockDepartments } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { DashboardHeader } from '@/components/dashboard-header'
import { showToast } from '@/components/ui/toast'
import {
  MessageSquare,
  Star,
  Download,
  AlertTriangle,
  CheckCircle2,
  ThumbsUp,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Smartphone,
  Check
} from 'lucide-react'

interface FeedbackEntry {
  id: string
  profile_id: string
  submitted_at: string
  overall_satisfaction: number
  daily_report_ease: number
  requisition_ease: number
  vs_paper_process: string
  encountered_bugs: boolean
  bugs_description: string | null
  mobile_experience_rating: number | null
  nps_score: number
  top_improvement: string
  additional_comments: string | null
  profile?: {
    full_name?: string
    email?: string
    role?: string
    department_id?: string
  }
}

export default function FeedbackAnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [feedbacks, setFeedbacks] = useState<FeedbackEntry[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all')
  const [bugsFilterOnly, setBugsFilterOnly] = useState(false)

  const loadFeedbackData = async () => {
    try {
      setRefreshing(true)
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        showToast('Please log in to access feedback analytics.', 'error')
        router.push('/login')
        return
      }

      // Check caller role
      const { data: currentProf } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      const userRole = currentProf?.role || user.user_metadata?.role

      if (userRole !== 'super_admin') {
        showToast('Access restricted: Feedback analytics is reserved for Secretariat Super Admins.', 'error')
        router.push('/dashboard')
        return
      }

      // Fetch departments
      const { data: dbDepts } = await supabase.from('departments').select('*')
      const depts = dbDepts && dbDepts.length > 0 ? dbDepts : mockDepartments
      setDepartments(depts)

      // Fetch all profiles for name/dept mapping
      const { data: dbProfiles } = await supabase.from('profiles').select('*')
      const profMap: Record<string, any> = {}
      if (dbProfiles) {
        dbProfiles.forEach(p => { profMap[p.id] = p })
      }
      setProfilesMap(profMap)

      // Fetch feedback entries
      let entries: FeedbackEntry[] = []
      if (isMock) {
        entries = store.platformFeedback || []
      } else {
        const { data: dbFeedbacks, error: fbErr } = await supabase
          .from('platform_feedback')
          .select(`
            *,
            profiles (
              full_name,
              email,
              role,
              department_id
            )
          `)
          .order('submitted_at', { ascending: false })

        if (fbErr) {
          console.error('Error fetching platform_feedback:', fbErr)
        } else if (dbFeedbacks) {
          entries = dbFeedbacks as FeedbackEntry[]
        }
      }

      setFeedbacks(entries)
    } catch (err: any) {
      showToast(`Failed to load feedback data: ${err.message}`, 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadFeedbackData()
  }, [])

  // Helper to map profile/dept details
  const getEntryProfileDetails = (entry: FeedbackEntry) => {
    const p = entry.profile || profilesMap[entry.profile_id] || {}
    const deptId = p.department_id
    const dept = departments.find(d => d.id === deptId)
    return {
      fullName: p.full_name || entry.profile_id || 'Unknown User',
      email: p.email || '—',
      role: p.role || 'HOD',
      deptName: dept?.name || (deptId ? 'Department' : 'Secretariat / National')
    }
  }

  // ── COMPUTED STATS ──
  const totalSubmissions = feedbacks.length

  const avgSatisfaction = totalSubmissions > 0
    ? (feedbacks.reduce((acc, f) => acc + (f.overall_satisfaction || 0), 0) / totalSubmissions).toFixed(1)
    : '0.0'

  const avgDailyEase = totalSubmissions > 0
    ? (feedbacks.reduce((acc, f) => acc + (f.daily_report_ease || 0), 0) / totalSubmissions).toFixed(1)
    : '0.0'

  const avgReqEase = totalSubmissions > 0
    ? (feedbacks.reduce((acc, f) => acc + (f.requisition_ease || 0), 0) / totalSubmissions).toFixed(1)
    : '0.0'

  // NPS Score Calculations
  const promoters = feedbacks.filter(f => f.nps_score >= 9).length
  const passives = feedbacks.filter(f => f.nps_score === 7 || f.nps_score === 8).length
  const detractors = feedbacks.filter(f => f.nps_score <= 6).length
  const npsIndex = totalSubmissions > 0
    ? Math.round(((promoters - detractors) / totalSubmissions) * 100)
    : 0
  const avgNpsScore = totalSubmissions > 0
    ? (feedbacks.reduce((acc, f) => acc + (f.nps_score || 0), 0) / totalSubmissions).toFixed(1)
    : '0.0'

  // Paper vs Digital Breakdown
  const vsPaperCounts: Record<string, number> = {
    much_easier: 0,
    easier: 0,
    about_the_same: 0,
    harder: 0,
    much_harder: 0
  }
  feedbacks.forEach(f => {
    if (vsPaperCounts[f.vs_paper_process] !== undefined) {
      vsPaperCounts[f.vs_paper_process]++
    }
  })

  // Bugs breakdown
  const bugSubmissions = feedbacks.filter(f => f.encountered_bugs || !!f.bugs_description)
  const bugCount = bugSubmissions.length
  const bugPercentage = totalSubmissions > 0 ? Math.round((bugCount / totalSubmissions) * 100) : 0

  // Mobile experience rating average
  const mobileRatings = feedbacks.map(f => f.mobile_experience_rating).filter((r): r is number => r !== null && r > 0)
  const avgMobileRating = mobileRatings.length > 0
    ? (mobileRatings.reduce((a, b) => a + b, 0) / mobileRatings.length).toFixed(1)
    : '0.0'
  const computerOnlyCount = feedbacks.filter(f => f.mobile_experience_rating === null || f.mobile_experience_rating === 0).length

  // Filtered List for Qualitative Feed
  const filteredFeedbacks = feedbacks.filter(f => {
    const details = getEntryProfileDetails(f)
    const matchesDept = selectedDeptFilter === 'all' || (f.profile?.department_id === selectedDeptFilter || details.deptName === selectedDeptFilter)
    const matchesBugs = !bugsFilterOnly || f.encountered_bugs || !!f.bugs_description
    const searchLower = searchTerm.toLowerCase().trim()
    const matchesSearch = !searchLower ||
      details.fullName.toLowerCase().includes(searchLower) ||
      details.deptName.toLowerCase().includes(searchLower) ||
      f.top_improvement.toLowerCase().includes(searchLower) ||
      (f.additional_comments && f.additional_comments.toLowerCase().includes(searchLower)) ||
      (f.bugs_description && f.bugs_description.toLowerCase().includes(searchLower))

    return matchesDept && matchesBugs && matchesSearch
  })

  // Export to CSV
  const handleExportCSV = () => {
    if (feedbacks.length === 0) {
      showToast('No feedback submissions available to export.', 'warning')
      return
    }

    const headers = [
      'Submission ID',
      'Submitted At',
      'User Full Name',
      'User Email',
      'User Role',
      'Department',
      'Overall Satisfaction (1-5)',
      'Daily Report Ease (1-5)',
      'Requisition Ease (1-5)',
      'vs Paper Process',
      'Encountered Bugs',
      'Bugs Description',
      'Mobile Rating (1-5)',
      'NPS Score (0-10)',
      'Top Improvement',
      'Additional Comments'
    ]

    const rows = feedbacks.map(f => {
      const d = getEntryProfileDetails(f)
      return [
        `"${f.id}"`,
        `"${new Date(f.submitted_at).toLocaleString()}"`,
        `"${d.fullName.replace(/"/g, '""')}"`,
        `"${d.email.replace(/"/g, '""')}"`,
        `"${d.role}"`,
        `"${d.deptName.replace(/"/g, '""')}"`,
        f.overall_satisfaction,
        f.daily_report_ease,
        f.requisition_ease,
        `"${f.vs_paper_process}"`,
        f.encountered_bugs ? 'Yes' : 'No',
        `"${(f.bugs_description || '').replace(/"/g, '""')}"`,
        f.mobile_experience_rating || 'Mostly Computer',
        f.nps_score,
        `"${f.top_improvement.replace(/"/g, '""')}"`,
        `"${(f.additional_comments || '').replace(/"/g, '""')}"`
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `dtce_convention_feedback_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Feedback survey data exported successfully!', 'success')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground animate-pulse">Loading Convention Feedback Analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <DashboardHeader />

      <main className="mx-auto max-w-[1400px] px-3 sm:px-6 pt-20 pb-16 space-y-6">
        
        {/* Header Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 border border-border p-4 sm:p-6 rounded-2xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                End-of-Convention Feedback
              </h1>
              <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                Super Admin Only
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Quantitative performance ratings &amp; qualitative recommendations submitted by Secretariat delegates &amp; HODs.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={loadFeedbackData}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-muted/30 hover:bg-muted/50 border border-border text-foreground transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/10 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Submissions (CSV)</span>
            </button>
          </div>
        </div>

        {/* ── KPI METRICS CARDS (5 COLUMNS) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Total Submissions */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Responses</span>
              <MessageSquare className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">{totalSubmissions}</span>
              <span className="text-[11px] text-muted-foreground font-medium">submissions</span>
            </div>
            <p className="text-[11px] text-muted-foreground/80">Permanent single-submission gate active</p>
          </div>

          {/* Card 2: Satisfaction Star Rating */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Overall Satisfaction</span>
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400">{avgSatisfaction}</span>
              <span className="text-[11px] text-muted-foreground font-medium">/ 5.0</span>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(Number(avgSatisfaction))
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground/30 fill-none'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Card 3: Daily Report Submission Ease */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Daily Report Ease</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">{avgDailyEase}</span>
              <span className="text-[11px] text-muted-foreground font-medium">/ 5.0</span>
            </div>
            <p className="text-[11px] text-muted-foreground/80">1 = Very Hard | 5 = Very Easy</p>
          </div>

          {/* Card 4: Materials Requisition Ease */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Requisition Ease</span>
              <ThumbsUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-400">{avgReqEase}</span>
              <span className="text-[11px] text-muted-foreground font-medium">/ 5.0</span>
            </div>
            <p className="text-[11px] text-muted-foreground/80">1 = Very Hard | 5 = Very Easy</p>
          </div>

          {/* Card 5: Net Promoter Score (NPS) */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Net Promoter Score</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black ${npsIndex >= 50 ? 'text-emerald-400' : npsIndex >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                {npsIndex > 0 ? `+${npsIndex}` : npsIndex}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">(Avg {avgNpsScore}/10)</span>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              {promoters} Promoters (9-10) | {detractors} Detractors (0-6)
            </p>
          </div>
        </div>

        {/* ── SECTION 2: COMPARISON & BUGS ANALYSIS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Comparison vs Paper Process (2 Columns wide) */}
          <div className="lg:col-span-2 p-5 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Platform vs. Paper-Based Process</h3>
                <p className="text-[11px] text-muted-foreground">User assessment comparing digital system against legacy paper workflow</p>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                {vsPaperCounts.much_easier + vsPaperCounts.easier} positive responses
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {[
                { key: 'much_easier', label: 'Much Easier', count: vsPaperCounts.much_easier, color: 'bg-emerald-500' },
                { key: 'easier', label: 'Easier', count: vsPaperCounts.easier, color: 'bg-blue-500' },
                { key: 'about_the_same', label: 'About the Same', count: vsPaperCounts.about_the_same, color: 'bg-amber-500' },
                { key: 'harder', label: 'Harder', count: vsPaperCounts.harder, color: 'bg-orange-500' },
                { key: 'much_harder', label: 'Much Harder', count: vsPaperCounts.much_harder, color: 'bg-red-500' }
              ].map((item) => {
                const pct = totalSubmissions > 0 ? Math.round((item.count / totalSubmissions) * 100) : 0
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-foreground">
                      <span>{item.label}</span>
                      <span>{item.count} responses ({pct}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} transition-all duration-500 rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Technical Health & Mobile Breakdown (1 Column wide) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <h3 className="text-sm font-bold text-foreground">Bugs &amp; Mobile Experience</h3>
                <Smartphone className="w-4 h-4 text-blue-400" />
              </div>

              <div className="space-y-4">
                {/* Bug Incident Card */}
                <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Reported System Bugs</span>
                    {bugCount > 0 ? (
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {bugCount} Users
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Zero Bugs
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bugPercentage}% of respondents encountered minor issues or UI bugs during convention reporting.
                  </p>
                </div>

                {/* Mobile Experience Card */}
                <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Mobile User Rating</span>
                    <span className="text-xs font-bold text-amber-400">{avgMobileRating} ★</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average rating among mobile delegates. {computerOnlyCount} users reported using a desktop/laptop computer.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setBugsFilterOnly(prev => !prev)}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                bugsFilterOnly
                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : 'bg-muted/30 hover:bg-muted/50 text-muted-foreground border-border'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{bugsFilterOnly ? 'Showing Bug Reports Only (Click to Clear)' : 'Filter Feed to Bug Reports Only'}</span>
            </button>
          </div>

        </div>

        {/* ── SECTION 3: QUALITATIVE FEEDBACK & SUGGESTIONS FEED ── */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Qualitative Feedback &amp; Suggestions Feed</h2>
              <p className="text-xs text-muted-foreground">Direct improvement suggestions and additional remarks from HODs and delegates</p>
            </div>

            {/* Controls: Search & Department Filter */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Box */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search feedback..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-card border border-border text-foreground text-xs outline-none focus:border-amber-500"
                />
              </div>

              {/* Department Filter Dropdown */}
              <div className="relative">
                <select
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                  className="pl-3 pr-8 py-1.5 rounded-xl bg-card border border-border text-foreground text-xs font-semibold outline-none cursor-pointer"
                >
                  <option value="all">All Departments</option>
                  {departments.slice().sort((a,b) => a.name.localeCompare(b.name)).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Feed Content Cards */}
          {filteredFeedbacks.length === 0 ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-semibold text-foreground">No feedback submissions found</p>
              <p className="text-xs text-muted-foreground">Try clearing your search filters or check back once delegates submit their surveys.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFeedbacks.map((f) => {
                const details = getEntryProfileDetails(f)
                return (
                  <div key={f.id} className="p-5 rounded-2xl bg-card border border-border space-y-3.5 flex flex-col justify-between shadow-xs">
                    
                    {/* Top Row: User details & rating badges */}
                    <div className="space-y-2 border-b border-border/60 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-foreground">{details.fullName}</h4>
                          <p className="text-[11px] text-amber-400 font-medium">{details.deptName}</p>
                        </div>
                        <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-400 shrink-0">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{f.overall_satisfaction}/5</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="bg-muted/30 px-2 py-0.5 rounded-md border border-border/50">Daily Ease: {f.daily_report_ease}/5</span>
                        <span className="bg-muted/30 px-2 py-0.5 rounded-md border border-border/50">Req Ease: {f.requisition_ease}/5</span>
                        <span className="bg-muted/30 px-2 py-0.5 rounded-md border border-border/50">NPS: {f.nps_score}/10</span>
                        {f.encountered_bugs && (
                          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Bug Reported
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Qualitative Responses */}
                    <div className="space-y-2.5 flex-1">
                      {/* Top Improvement Suggestion */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Top Improvement Recommendation</span>
                        <p className="text-xs text-foreground bg-muted/20 p-2.5 rounded-xl border border-border/50 leading-relaxed">
                          "{f.top_improvement}"
                        </p>
                      </div>

                      {/* Additional Comments */}
                      {f.additional_comments && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Additional Remarks</span>
                          <p className="text-xs text-muted-foreground bg-muted/10 p-2.5 rounded-xl border border-border/40 leading-relaxed italic">
                            "{f.additional_comments}"
                          </p>
                        </div>
                      )}

                      {/* Bug Description if present */}
                      {f.bugs_description && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Technical Bug Details
                          </span>
                          <p className="text-xs text-red-300/90 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 leading-relaxed">
                            {f.bugs_description}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Timestamp */}
                    <div className="text-[10px] text-muted-foreground/60 border-t border-border/40 pt-2 flex items-center justify-between">
                      <span>Submitted: {new Date(f.submitted_at).toLocaleString()}</span>
                      <span className="capitalize text-muted-foreground">{f.vs_paper_process.replace('_', ' ')}</span>
                    </div>

                  </div>
                )
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
