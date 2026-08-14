'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEventDays, Profile, DailyReport, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import {
  extractCustomMetricsSummary,
  extractAllConsolidatedChallenges,
  extractDepartmentQualitativeLogs,
  extractOfferingSummary,
  extractRegistrationTwoChannelSummary,
  extractUsheringV2Summary,
  extractMedicalSummary,
  extractWelfareSummary,
  extractStoresSummary,
  extractSepuSummary,
  extractBibleStudySummary,
  extractTeensProgramSummary
} from '@/utils/customMetricsSummarizer'
import { compileStrategicStoresReport, StrategicStoresSummary } from '@/utils/storesReportSummarizer'
import Link from 'next/link'
import { Bell, ShoppingBag, FileSpreadsheet, Layers, BarChart3, X, Download, Award } from 'lucide-react'

export default function ReportsExportPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  
  // Datasets for preview
  const [event, setEvent] = useState<any>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [narratives, setNarratives] = useState<any[]>([])
  const [eventDays, setEventDays] = useState<any[]>([])
  const [preEventTotals, setPreEventTotals] = useState<any[]>([])
  const [storeRequests, setStoreRequests] = useState<any[]>([])
  
  // Form controls
  const [exportLabel, setExportLabel] = useState('First Draft')
  const [exporting, setExporting] = useState(false)
  const [exportingStores, setExportingStores] = useState(false)
  const [exportingSecretariat, setExportingSecretariat] = useState(false)
  const [showStoresModal, setShowStoresModal] = useState(false)

  // Notifications controls
  const [digestDay, setDigestDay] = useState('1')
  const [digestCutoff, setDigestCutoff] = useState('18:00')
  const [notifLogs, setNotifLogs] = useState<any[]>([])
  const [sendingDigest, setSendingDigest] = useState(false)

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
      // Check authorization (Exclusively Secretariat super_admin or coordinator)
      if (prof.role !== 'super_admin' && prof.role !== 'coordinator' && prof.role !== 'national_coordinator') {
        showToast('Forbidden: Report generation/export is restricted exclusively to Secretariat and Admins.', 'error')
        router.push('/dashboard')
        return
      }
      setProfile(prof)

      const { data: eventsList } = await supabase.from('events').select('*')
      if (eventsList && eventsList.length > 0) setEvent(eventsList[0])

      const { data: depts } = await supabase.from('departments').select('*')
      setDepartments(((depts || mockDepartments) as Department[]).sort((a,b) => a.name.localeCompare(b.name)))

      const { data: reps } = await supabase.from('daily_reports').select('*')
      setReports(reps || [])

      const { data: narrs } = await supabase.from('department_narratives').select('*')
      setNarratives(narrs || [])

      const { data: eDays } = await supabase.from('event_days').select('*')
      setEventDays(eDays || mockEventDays)

      const { data: preTotals } = await supabase.from('registration_pre_event_totals').select('*')
      setPreEventTotals(preTotals || [])

      const { data: sReqs } = await supabase.from('store_requests').select('*')
      setStoreRequests(sReqs || [])

      const { data: logs } = await supabase.from('notification_logs').select('*')
      setNotifLogs(logs || [])
    }
  }

  const handleExportStoresDocx = async () => {
    setExportingStores(true)
    try {
      showToast('Generating Strategic Stores Audit Report (DOCX)...', 'info')
      const downloadUrl = `/api/export-stores-report?label=${encodeURIComponent(exportLabel)}`
      const res = await fetch(downloadUrl)
      if (!res.ok) {
        const errText = await res.text()
        showToast(`Export failed: ${errText || res.statusText}`, 'error')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `DTCE_Stores_Requisition_and_Materials_Flow_Report.docx`)
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)
      showToast('Your Stores Requisition & Materials Flow DOCX Report has downloaded!', 'success')
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`, 'error')
    } finally {
      setExportingStores(false)
    }
  }

  const handleExportSecretariatDocx = async () => {
    setExportingSecretariat(true)
    try {
      showToast('Compiling Secretariat Strategic Board Report (DOCX)...', 'info')
      const downloadUrl = `/api/export-secretariat-report`
      const res = await fetch(downloadUrl)
      if (!res.ok) {
        const errText = await res.text()
        showToast(`Export failed: ${errText || res.statusText}`, 'error')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `DTCE_Secretariat_Strategic_Board_Report_${new Date().toISOString().slice(0, 10)}.docx`)
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)
      showToast('Your Secretariat Strategic Board Report has been compiled and downloaded!', 'success')
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`, 'error')
    } finally {
      setExportingSecretariat(false)
    }
  }

  const handleExportStoresCsv = () => {
    const storesReport = compileStrategicStoresReport(storeRequests, reports, departments, eventDays)
    const headers = ['Report Category', 'Entity / Item Name', 'Metric 1', 'Metric 2', 'Status / Fulfillment']
    const rows: string[] = []

    rows.push(`"KPI Summary","Total Requisitions Submitted","${storesReport.kpis.totalRequisitions}","Fulfillment Rate: ${storesReport.kpis.fulfillmentRate}%",""`)
    rows.push(`"KPI Summary","Materials Requested vs Approved","Requested: ${storesReport.kpis.totalItemsRequested} units","Approved: ${storesReport.kpis.totalItemsApproved} units",""`)

    storesReport.departmentDemand.forEach(d => {
      rows.push(`"Department Demand","${d.departmentName.replace(/"/g, '""')}","Total Requests: ${d.totalRequests}","Units Requested: ${d.totalUnitsRequested}","Fulfillment: ${d.fulfillmentRate}%"`)
    })

    storesReport.itemVelocity.forEach(item => {
      rows.push(`"Item Consumption","${item.itemName.replace(/"/g, '""')}","Category: ${item.category}","Requested: ${item.totalRequested} ${item.unit} | Approved: ${item.totalApproved} ${item.unit}","Approval Ratio: ${item.approvalRatio}%"`)
    })

    storesReport.durablesLog.forEach(d => {
      rows.push(`"Stores Durables Log","${d.dayLabel} - ${d.itemName.replace(/"/g, '""')}","Dept: ${d.department}","Issued: ${d.qtyIssued} | Returned: ${d.qtyReturned}","Balance: ${d.balance}"`)
    })

    storesReport.consumablesLog.forEach(c => {
      rows.push(`"Stores Consumables Log","${c.dayLabel} - ${c.itemName.replace(/"/g, '""')}","Dept: ${c.department}","Qty Issued: ${c.qtyIssued}",""`)
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `dtce_stores_requisition_and_materials_flow_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Stores materials flow CSV dataset exported successfully!', 'success')
  }

  const handleTriggerDigest = async () => {
    setSendingDigest(true)
    try {
      const res = await fetch(`/api/send-digest?day=${digestDay}&cutoff=${encodeURIComponent(digestCutoff)}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        showToast(`Successfully triggered daily digest reminders! Sent ${data.notifications_sent} emails in ${data.delivery_mode} mode.`, 'success')
        const supabase = getClient()
        const { data: logs } = await supabase.from('notification_logs').select('*')
        setNotifLogs(logs || [])
      } else {
        showToast(`Error triggering digest: ${data.error}`, 'error')
      }
    } catch (err: any) {
      showToast(`Digest failed: ${err.message}`, 'error')
    } finally {
      setSendingDigest(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Trigger export endpoint
  const handleExportDocx = () => {
    setExporting(true)
    const downloadUrl = `/api/export-docx?label=${encodeURIComponent(exportLabel)}`
    
    const link = document.createElement('a')
    link.href = downloadUrl
    link.setAttribute('download', `${event?.name || 'DTCE_Convention'}_Report.docx`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    setTimeout(() => {
      setExporting(false)
      showToast('Your branded DOCX report has been generated and is downloading!', 'success')
    }, 1500)
  }

  // Derived datasets
  const eoeNarratives = narratives.filter(n => n.is_end_of_event === true)
  const consolidated = extractAllConsolidatedChallenges(reports, narratives, departments, eventDays)
  const offeringBreakdown = extractOfferingSummary(reports, departments)

  return (
    <div className="min-h-screen bg-mesh" style={{ background: 'var(--background)' }}>
      {/* Heading Block */}
      <div className="border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between py-6 px-4 md:px-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Secretariat Panel</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Report Generation &amp; Export
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Dynamic document builder with Word DOCX compilation.
            </p>
          </div>
          
          <div className="flex items-center">
            <Link href="/dashboard">
              <button
                className="flex items-center gap-1.5 h-9 rounded-lg px-4 text-xs font-semibold transition-all border border-border/70 bg-card hover:bg-accent/60 text-foreground cursor-pointer shadow-xs"
              >
                ➔ Oversight Grid Matrix
              </button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in-up">
        
        {/* Left Side: Export Settings (1 col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Export Settings</h2>
            <p className="text-[12px] text-muted-foreground mb-4">Configure file labeling and download options.</p>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="version-label" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Version/Revision Label
                </label>
                <input
                  id="version-label"
                  value={exportLabel}
                  onChange={(e) => setExportLabel(e.target.value)}
                  placeholder="e.g. First Draft, Final Version 1"
                  className="input-dark h-9 text-[13px] text-foreground"
                />
              </div>

              <div className="p-3.5 rounded-xl text-[12px] text-muted-foreground space-y-2.5 bg-muted/20 border border-border">
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> Branded Letterhead</p>
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> All {departments.length || 43} Departments</p>
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> Specialized Tables (Ushering, Medical, Reg, Welfare, Stores)</p>
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> Income &amp; Expenditure Appendix</p>
              </div>

              <button
                onClick={handleExportDocx}
                disabled={exporting}
                className="w-full rounded-xl py-2.5 text-[13px] font-bold text-white transition-all cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)', border: '1px solid rgba(59,130,246,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                {exporting ? 'Generating...' : '📥 Export General DOCX'}
              </button>
            </div>
          </div>

          {/* Dedicated Stores Requisition & Materials Flow Audit Card */}
          <div className="glass-card p-5 border-amber-500/40 bg-amber-500/5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 flex items-center gap-1.5 font-sans">
                <ShoppingBag className="w-4 h-4 text-amber-400" /> Stores Material Audit
              </h2>
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30 font-mono">
                Standalone Report
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">
              Dedicated strategic report on store requisitions, material consumption velocity, and inventory flow.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={handleExportStoresDocx}
                disabled={exportingStores}
                className="w-full rounded-xl py-2.5 text-[12px] font-bold text-black transition-all cursor-pointer bg-amber-500 hover:bg-amber-400 flex items-center justify-center gap-1.5 shadow-xs"
              >
                {exportingStores ? 'Generating Stores Report...' : '📥 Export Stores DOCX Report'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportStoresCsv}
                  className="rounded-xl py-2 text-[11px] font-semibold text-foreground transition-all bg-card border border-border hover:bg-muted/40 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" /> Stores CSV
                </button>

                <button
                  onClick={() => setShowStoresModal(true)}
                  className="rounded-xl py-2 text-[11px] font-semibold text-amber-400 transition-all bg-amber-950/30 border border-amber-500/30 hover:bg-amber-950/50 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-amber-400" /> View Preview
                </button>
              </div>
            </div>
          </div>

          {/* Secretariat Strategic Board Report Card */}
          <div className="glass-card p-5 border-purple-500/40 bg-purple-500/5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-purple-400 flex items-center gap-1.5 font-sans">
                <Award className="w-4 h-4 text-purple-400" /> Secretariat Board Report
              </h2>
              <span className="text-[10px] font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 font-mono">
                Board Presentation
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">
              Formal, publication-ready institutional strategic report for the Board of Trustees, including compliance, NPS, HOD feedback, and impact assessment.
            </p>

            <button
              onClick={handleExportSecretariatDocx}
              disabled={exportingSecretariat}
              className="w-full rounded-xl py-2.5 text-[12px] font-bold text-white transition-all cursor-pointer bg-purple-600 hover:bg-purple-500 flex items-center justify-center gap-1.5 shadow-xs"
            >
              {exportingSecretariat ? 'Compiling Board Report...' : '🏛️ Export Board DOCX Report'}
            </button>
          </div>

          <div className="glass-card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5 font-sans">
              <Bell className="w-3.5 h-3.5 text-amber-400" /> Daily Reminders
            </h2>
            <p className="text-[12px] text-muted-foreground mb-4">Send reminders to HODs and collation logs to Secretariat.</p>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="digest-day" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Target Day</label>
                <select
                  id="digest-day"
                  value={digestDay}
                  onChange={(e) => setDigestDay(e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-[13px] font-medium text-foreground bg-card border border-border cursor-pointer outline-none"
                >
                  <option value="1" className="bg-card text-foreground">Day 1</option>
                  <option value="2" className="bg-card text-foreground">Day 2</option>
                  <option value="3" className="bg-card text-foreground">Day 3</option>
                  <option value="4" className="bg-card text-foreground">Day 4</option>
                  <option value="5" className="bg-card text-foreground">Day 5</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="digest-cutoff" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Cutoff Time</label>
                <input
                  id="digest-cutoff"
                  value={digestCutoff}
                  onChange={(e) => setDigestCutoff(e.target.value)}
                  placeholder="e.g. 18:00"
                  className="input-dark h-9 text-[13px] text-foreground"
                />
              </div>

              <button
                onClick={handleTriggerDigest}
                disabled={sendingDigest}
                className="w-full rounded-xl py-2.5 text-[13px] font-bold text-foreground transition-all bg-card border border-border hover:bg-muted/30 cursor-pointer"
              >
                {sendingDigest ? 'Sending Reminders...' : 'Trigger Daily Reminders'}
              </button>
            </div>
          </div>

          <div className="glass-card p-5 max-h-[350px] flex flex-col">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Simulated Email Logs</h2>
            <div className="overflow-y-auto pr-1 space-y-3 flex-1 scrollbar-hide text-[11px]">
              {notifLogs.slice().reverse().map((log) => (
                <div key={log.id} className="pb-3.5 space-y-1.5 border-b border-border">
                  <div className="flex justify-between text-muted-foreground font-mono text-[10px]">
                    <span>To: {log.recipient}</span>
                    <span>{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <p className="font-semibold text-foreground">{log.subject}</p>
                  <p className="text-muted-foreground leading-tight p-2 rounded-lg bg-muted/20 border border-border">
                    {log.body.substring(0, 120)}...
                  </p>
                </div>
              ))}
              {notifLogs.length === 0 && (
                <p className="text-[12px] italic text-muted-foreground text-center py-4">No notification logs recorded.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Document Preview Screen (3 cols) */}
        <div className="lg:col-span-3">
          <div className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="px-5 py-3.5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Document Preview</span>
              </div>
            </div>
            
            <div className="overflow-y-auto px-8 py-10 flex-1 scrollbar-hide bg-card">
              <div className="max-w-3xl mx-auto space-y-8 text-foreground font-serif leading-relaxed" style={{ fontSize: '15px' }}>
                
                {/* Header Letterhead Preview */}
                <div className="flex flex-col items-center pb-6 text-center space-y-2.5 font-sans border-b-2 border-primary/20">
                  <div className="h-14 w-14 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary text-xl font-bold font-mono">⛪</div>
                  <h3 className="text-[16px] font-bold text-foreground tracking-wide uppercase">THE REDEEMED CHRISTIAN CHURCH OF GOD</h3>
                  <h4 className="text-[12px] font-bold text-amber-500 uppercase tracking-widest">JUNIOR CHURCH GLOBAL SECRETARIAT</h4>
                  <p className="text-[11px] text-muted-foreground uppercase font-mono tracking-wider">{event?.name || 'CONVENTION REPORT'}</p>
                </div>

                {/* Title Section */}
                <div className="py-6 text-center space-y-2 font-sans">
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">{event?.name || 'CONVENTION SUMMARY REPORT'}</h2>
                  <p className="text-[13px] text-muted-foreground italic">Consolidated Administrative and Departmental Activity Log</p>
                </div>

                {/* 1. Executive Summary */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-foreground font-sans pb-1.5 border-b border-border">1. Executive Summary</h3>
                  <p className="text-[14px] text-muted-foreground font-light">
                    This consolidated report presents the administrative, attendance, and operational metrics of the Junior Church Global Secretariat during the {event?.name || 'Annual Convention'}. It compiles metrics from all {departments.length || 43} departments tasked with delegate management, welfare, medical care, and logistics.
                  </p>
                  <p className="text-[12px] italic text-muted-foreground font-sans bg-muted/20 p-2 rounded border border-border/50">
                    📊 Data freshness: {reports.length > 0 ? `${new Set(reports.map(r => r.department_id)).size} of ${departments.length || 43} departments have submitted daily data. ${eoeNarratives.length} of ${departments.length || 43} departments have finalized end-of-event narratives.` : 'No daily data submitted yet.'}
                  </p>
                </div>

                {/* 2. General Attendance table */}
                <div className="space-y-4">
                  <h3 className="text-[15px] font-bold text-foreground font-sans pb-1.5 border-b border-border">2. General Report of Activities</h3>
                  <p className="text-[12px] italic text-muted-foreground font-sans">Day-by-Day general attendance logged across all department sections:</p>
                  <div className="border border-border rounded-xl overflow-hidden font-sans text-[13px] bg-background">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-foreground font-bold bg-muted/40 border-b border-border">
                          <th className="p-3 border-r border-border">Convention Day</th>
                          <th className="p-3 border-r border-border text-center font-tabular">Total Morning Attendance</th>
                          <th className="p-3 text-center font-tabular">Total Evening Attendance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-muted-foreground">
                        {reports.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-3 text-center italic">No daily report data submitted yet.</td>
                          </tr>
                        ) : (
                          ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'].map((dayLabel, idx) => {
                            const dayReports = reports.filter(r => r.event_day_id === `day-${idx+1}` || r.event_day_id === mockEventDays[idx]?.id)
                            const mornTotal = dayReports.reduce((s, r) => s + (Number(r.attendance_morning) || 0), 0)
                            const eveTotal = dayReports.reduce((s, r) => s + (Number(r.attendance_evening) || 0), 0)
                            return (
                              <tr key={dayLabel} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                                <td className="p-3 border-r border-border font-semibold text-foreground">{dayLabel}</td>
                                <td className="p-3 border-r border-border text-center font-mono font-bold text-foreground">{mornTotal.toLocaleString()}</td>
                                <td className="p-3 text-center font-mono font-bold text-foreground">{eveTotal.toLocaleString()}</td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Departmental Reports */}
                <div className="space-y-6">
                  <h3 className="text-[15px] font-bold text-foreground font-sans pb-1.5 border-b border-border">3. Departmental Reports (All {departments.length || 43} Departments)</h3>
                  
                  {departments.slice().sort((a,b) => a.name.localeCompare(b.name)).map((dept) => {
                    const narr = eoeNarratives.find(n => n.department_id === dept.id)
                    const deptReps = reports.filter(r => r.department_id === dept.id)
                    const qualLogs = extractDepartmentQualitativeLogs(dept.id, reports, narratives, eventDays)
                    const deptNameLower = dept.name.toLowerCase()

                    // Extract specialized structures
                    const isRegistration = deptNameLower.includes('registration')
                    const isUshering = deptNameLower.includes('ushering')
                    const isMedical = deptNameLower.includes('medical')
                    const isWelfare = deptNameLower.includes('welfare') || deptNameLower.includes('kitchen') || deptNameLower.includes('serving')
                    const isStores = deptNameLower.includes('store') || deptNameLower.includes('stores')
                    const isSepu = deptNameLower.includes('safety') || deptNameLower.includes('sepu')
                    const isBibleStudy = deptNameLower.includes('bible study') || deptNameLower.includes('holy land')
                    const isTeensProgram = deptNameLower.includes('programme') || deptNameLower.includes('program') || deptNameLower.includes('teens')

                    const regSummary = isRegistration ? extractRegistrationTwoChannelSummary(deptReps) : null
                    const usheringSummary = isUshering ? extractUsheringV2Summary(deptReps.filter(r => r.metrics_data?.schema_version === 2 || r.metrics_data?.custom_schema?.schema_version === 2), eventDays) : []
                    const medSummary = isMedical ? extractMedicalSummary(deptReps, eventDays) : null
                    const welfareSummary = isWelfare ? extractWelfareSummary(deptReps) : []
                    const storesSummary = isStores ? extractStoresSummary(deptReps) : null
                    const sepuSummary = isSepu ? extractSepuSummary(deptReps) : []
                    const bibleStudySummary = isBibleStudy ? extractBibleStudySummary(deptReps) : []
                    const teensSummary = isTeensProgram ? extractTeensProgramSummary(deptReps) : []
                    const customGroups = extractCustomMetricsSummary(deptReps)

                    return (
                      <div key={dept.id} className="space-y-3.5 pl-4 border-l-2 border-amber-500/40">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[14px] font-bold text-amber-500 font-sans">{dept.name}</h4>
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                            {deptReps.length} day(s) submitted {narr ? '• Narrative: Finalized' : '• Narrative: Pending'}
                          </span>
                        </div>

                        {/* End-of-Event Overview & Highlights */}
                        {narr ? (
                          <div className="space-y-1.5 bg-muted/10 p-3 rounded-lg border border-border/40">
                            <p className="text-[13px] text-muted-foreground font-light"><strong className="text-foreground font-semibold">End-of-Event Overview:</strong> {narr.overview}</p>
                            {narr.highlights && (
                              <p className="text-[13px] text-muted-foreground font-light"><strong className="text-foreground font-semibold">Key Highlights:</strong> {narr.highlights}</p>
                            )}
                          </div>
                        ) : deptReps.length > 0 ? (
                          <p className="text-[12px] italic text-muted-foreground">Daily logs recorded; end-of-event summary pending.</p>
                        ) : (
                          <p className="text-[12px] italic text-muted-foreground">No data submitted for this department.</p>
                        )}

                        {/* Daily Qualitative Logs */}
                        {qualLogs.length > 0 && (
                          <div className="space-y-2.5 my-2">
                            <h5 className="text-[12px] font-bold text-teal-400 font-sans uppercase tracking-wider">Daily Operational &amp; Qualitative Notes</h5>
                            {qualLogs.map((qLog, qIdx) => (
                              <div key={qIdx} className="p-3 rounded-lg bg-teal-950/20 border border-teal-500/30 text-[12px] space-y-1 font-sans">
                                <div className="font-bold text-teal-300">📌 {qLog.dayLabel} Log</div>
                                {qLog.overview && <p><strong className="text-foreground">Overview:</strong> {qLog.overview}</p>}
                                {qLog.achievements && <p><strong className="text-foreground">Activities &amp; Achievements:</strong> {qLog.achievements}</p>}
                                {qLog.challenges && <p><strong className="text-amber-400">Challenges:</strong> {qLog.challenges}</p>}
                                {qLog.recommendations && <p><strong className="text-teal-400">Solutions / Recommendations:</strong> {qLog.recommendations}</p>}
                                {qLog.plansForTomorrow && <p><strong className="text-foreground">Plans / Follow-up:</strong> {qLog.plansForTomorrow}</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* General Attendance Statistics Table */}
                        {deptReps.length > 0 && (
                          <div className="space-y-3 my-3">
                            <h5 className="text-[12px] font-bold text-muted-foreground font-sans uppercase tracking-wider">Attendance Statistics</h5>
                            <div className="border border-border rounded-xl overflow-hidden font-sans text-[11px] w-full max-w-md bg-background">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="font-bold border-b border-border text-muted-foreground bg-muted/30">
                                    <th className="p-2 border-r border-border">Day</th>
                                    <th className="p-2 border-r border-border text-center font-tabular">Morning</th>
                                    <th className="p-2 border-r border-border text-center font-tabular">Evening</th>
                                    <th className="p-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground">
                                  {deptReps.map((r, rIdx) => (
                                    <tr key={r.id}>
                                      <td className="p-2 border-r border-border">Day {rIdx + 1}</td>
                                      <td className="p-2 border-r border-border text-center font-mono font-semibold text-foreground">{r.attendance_morning}</td>
                                      <td className="p-2 border-r border-border text-center font-mono font-semibold text-foreground">{r.attendance_evening}</td>
                                      <td className="p-2 text-center uppercase tracking-wider text-[9px] font-bold text-emerald-500">{r.status}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* ━━ SPECIALIZED SECTIONS TABLES ━━ */}

                        {/* 1. Registration Two-Channel Section */}
                        {isRegistration && regSummary && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-teal-400 uppercase tracking-wider">Registration — Two-Channel Analysis</h5>
                            
                            {/* Section A */}
                            <div className="border border-teal-500/30 rounded-xl overflow-hidden bg-background">
                              <div className="bg-teal-950/40 px-3 py-1.5 border-b border-teal-500/30 font-bold text-teal-300 text-[11px]">
                                SECTION A — Online Manual Pickups
                              </div>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Category</th>
                                    <th className="p-2 border-r border-border text-center">Manuals Picked Up</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {regSummary.sectionA.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{item.category}</td>
                                      <td className="p-2 text-center font-mono font-bold text-foreground">{item.pickedUp.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Section B */}
                            <div className="border border-teal-500/30 rounded-xl overflow-hidden bg-background">
                              <div className="bg-teal-950/40 px-3 py-1.5 border-b border-teal-500/30 font-bold text-teal-300 text-[11px]">
                                SECTION B — Offline / Walk-in Registrations
                              </div>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Category</th>
                                    <th className="p-2 border-r border-border text-center">New Regs</th>
                                    <th className="p-2 border-r border-border text-center">Manuals</th>
                                    <th className="p-2 text-right">Fees (₦)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {regSummary.sectionB.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{item.category}</td>
                                      <td className="p-2 border-r border-border text-center font-mono">{item.newRegistrations.toLocaleString()}</td>
                                      <td className="p-2 border-r border-border text-center font-mono">{item.manualsDistributed.toLocaleString()}</td>
                                      <td className="p-2 text-right font-mono font-bold text-foreground">₦{item.amountCollected.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 2. Ushering 5-Section Summary */}
                        {isUshering && usheringSummary.length > 0 && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-amber-400 uppercase tracking-wider">Ushering — Granular Five-Section Daily Attendance &amp; Offering Breakdown</h5>
                            {usheringSummary.map((sec, idx) => (
                              <div key={idx} className="border border-amber-500/30 rounded-xl overflow-hidden bg-background space-y-1">
                                <div className="bg-amber-950/40 px-3 py-1.5 border-b border-amber-500/30 font-bold text-amber-300 text-[11px] flex justify-between">
                                  <span>{sec.sectionTitle}</span>
                                  <span>Total Offering: ₦{sec.totals.offering.toLocaleString()}</span>
                                </div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                      <th className="p-2 border-r border-border">Day</th>
                                      <th className="p-2 border-r border-border">Session / Event</th>
                                      <th className="p-2 border-r border-border">Preacher / Guest</th>
                                      <th className="p-2 border-r border-border text-center">Male</th>
                                      <th className="p-2 border-r border-border text-center">Female</th>
                                      <th className="p-2 border-r border-border text-center font-bold">Total</th>
                                      <th className="p-2 text-right">Offering (₦)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                    {sec.rows.map((row, rIdx) => (
                                      <tr key={rIdx}>
                                        <td className="p-2 border-r border-border font-bold text-amber-400">{row.dayLabel}</td>
                                        <td className="p-2 border-r border-border font-semibold text-foreground">{row.event || '—'}</td>
                                        <td className="p-2 border-r border-border text-foreground/80">{row.preacher || '—'}</td>
                                        <td className="p-2 border-r border-border text-center font-mono">{row.male.toLocaleString()}</td>
                                        <td className="p-2 border-r border-border text-center font-mono">{row.female.toLocaleString()}</td>
                                        <td className="p-2 border-r border-border text-center font-mono font-bold text-foreground">{row.total.toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono">₦{row.offering.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 3. Medical Department Summary */}
                        {isMedical && medSummary && (medSummary.demographics.length > 0 || medSummary.diagnoses.length > 0) && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-emerald-400 uppercase tracking-wider">Medical — Granular Daily Consultations &amp; Clinical Case Index</h5>
                            {medSummary.demographics.length > 0 && (
                              <div className="border border-emerald-500/30 rounded-xl overflow-hidden bg-background">
                                <div className="bg-emerald-950/40 px-3 py-1.5 border-b border-emerald-500/30 font-bold text-emerald-300 text-[11px]">
                                  Patient Demographics (Daily Figures)
                                </div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                      <th className="p-2 border-r border-border">Day</th>
                                      <th className="p-2 border-r border-border">Category</th>
                                      <th className="p-2 border-r border-border text-center">Gender</th>
                                      <th className="p-2 text-right font-bold">Patient Count</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                    {medSummary.demographics.map((d, idx) => (
                                      <tr key={idx}>
                                        <td className="p-2 border-r border-border font-bold text-emerald-400">{d.dayLabel || '—'}</td>
                                        <td className="p-2 border-r border-border font-semibold text-foreground">{d.category}</td>
                                        <td className="p-2 border-r border-border text-center font-mono capitalize">{d.gender}</td>
                                        <td className="p-2 text-right font-mono font-bold text-foreground">{d.count.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-emerald-950/20 font-bold text-emerald-300 text-[11px]">
                                      <td colSpan={3} className="p-2 border-r border-border uppercase">Total Patients Registered</td>
                                      <td className="p-2 text-right font-mono font-bold">{medSummary.totals.patients.toLocaleString()}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                            {medSummary.diagnoses.length > 0 && (
                              <div className="border border-emerald-500/30 rounded-xl overflow-hidden bg-background">
                                <div className="bg-emerald-950/40 px-3 py-1.5 border-b border-emerald-500/30 font-bold text-emerald-300 text-[11px]">
                                  Diagnoses &amp; Cases Treated (Daily Figures)
                                </div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                      <th className="p-2 border-r border-border">Day</th>
                                      <th className="p-2 border-r border-border">Diagnosis / Symptom</th>
                                      <th className="p-2 text-right font-bold">Cases Treated</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                    {medSummary.diagnoses.map((d, idx) => (
                                      <tr key={idx}>
                                        <td className="p-2 border-r border-border font-bold text-emerald-400">{d.dayLabel || '—'}</td>
                                        <td className="p-2 border-r border-border font-semibold text-foreground">{d.diagnosis}</td>
                                        <td className="p-2 text-right font-mono font-bold text-foreground">{d.count.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-emerald-950/20 font-bold text-emerald-300 text-[11px]">
                                      <td colSpan={2} className="p-2 border-r border-border uppercase">Total Clinical Cases Treated</td>
                                      <td className="p-2 text-right font-mono font-bold">{medSummary.totals.cases.toLocaleString()}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 4. Welfare (Serving) Department Summary */}
                        {isWelfare && welfareSummary.length > 0 && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-amber-400 uppercase tracking-wider">Welfare (Kitchen / Serving) — Meal Allocations</h5>
                            <div className="border border-amber-500/30 rounded-xl overflow-hidden bg-background">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Meal Type</th>
                                    <th className="p-2 border-r border-border text-center font-bold">Quantity Served</th>
                                    <th className="p-2 text-left">Distribution Notes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {welfareSummary.map((w, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{w.mealType}</td>
                                      <td className="p-2 border-r border-border text-center font-mono font-bold text-foreground">{w.qtyServed.toLocaleString()}</td>
                                      <td className="p-2 text-left text-muted-foreground">{w.notes}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 5. Stores Department Summary */}
                        {isStores && storesSummary && (storesSummary.durables.length > 0 || storesSummary.consumables.length > 0) && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-blue-400 uppercase tracking-wider">Stores — Inventory Tracking &amp; Requisitions</h5>
                            {storesSummary.durables.length > 0 && (
                              <div className="border border-blue-500/30 rounded-xl overflow-hidden bg-background">
                                <div className="bg-blue-950/40 px-3 py-1.5 border-b border-blue-500/30 font-bold text-blue-300 text-[11px]">Durables Log</div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                      <th className="p-2 border-r border-border">Item Name</th>
                                      <th className="p-2 border-r border-border text-center">In-Stock</th>
                                      <th className="p-2 border-r border-border text-center font-bold">Issued</th>
                                      <th className="p-2 text-center">Returned</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                    {storesSummary.durables.map((d, idx) => (
                                      <tr key={idx}>
                                        <td className="p-2 border-r border-border font-semibold text-foreground">{d.itemName}</td>
                                        <td className="p-2 border-r border-border text-center font-mono">{d.qtyInStock.toLocaleString()}</td>
                                        <td className="p-2 border-r border-border text-center font-mono font-bold text-foreground">{d.qtyIssued.toLocaleString()}</td>
                                        <td className="p-2 text-center font-mono">{d.qtyReturned.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {storesSummary.consumables.length > 0 && (
                              <div className="border border-blue-500/30 rounded-xl overflow-hidden bg-background">
                                <div className="bg-blue-950/40 px-3 py-1.5 border-b border-blue-500/30 font-bold text-blue-300 text-[11px]">Consumables Log</div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                      <th className="p-2 border-r border-border">Item Name</th>
                                      <th className="p-2 border-r border-border text-center">In-Stock</th>
                                      <th className="p-2 text-center font-bold">Issued</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                    {storesSummary.consumables.map((c, idx) => (
                                      <tr key={idx}>
                                        <td className="p-2 border-r border-border font-semibold text-foreground">{c.itemName}</td>
                                        <td className="p-2 border-r border-border text-center font-mono">{c.qtyInStock.toLocaleString()}</td>
                                        <td className="p-2 text-center font-mono font-bold text-foreground">{c.qtyIssued.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 6. SEPU Safety Department Summary */}
                        {isSepu && sepuSummary.length > 0 && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-red-400 uppercase tracking-wider">SEPU — Daily Incident Index</h5>
                            <div className="border border-red-500/30 rounded-xl overflow-hidden bg-background">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Incident Description</th>
                                    <th className="p-2 border-r border-border">Action Taken</th>
                                    <th className="p-2">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {sepuSummary.map((s, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{s.incidence}</td>
                                      <td className="p-2 border-r border-border">{s.actionTaken}</td>
                                      <td className="p-2 text-muted-foreground">{s.remarks}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 7. Bible Study / Holy Land Summary */}
                        {isBibleStudy && bibleStudySummary.length > 0 && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-purple-400 uppercase tracking-wider">Bible Study — Tribal Attendance Breakdown</h5>
                            <div className="border border-purple-500/30 rounded-xl overflow-hidden bg-background">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Tribe / Category</th>
                                    <th className="p-2 border-r border-border text-center">Teachers M/F</th>
                                    <th className="p-2 border-r border-border text-center">Teens M/F</th>
                                    <th className="p-2 text-right font-bold">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {bibleStudySummary.map((tr, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{tr.tribe}</td>
                                      <td className="p-2 border-r border-border text-center font-mono">{tr.teachersMale} / {tr.teachersFemale}</td>
                                      <td className="p-2 border-r border-border text-center font-mono">{tr.teenagersMale} / {tr.teenagersFemale}</td>
                                      <td className="p-2 text-right font-mono font-bold text-foreground">{tr.total.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 8. Teens Programs Summary */}
                        {isTeensProgram && teensSummary.length > 0 && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-indigo-400 uppercase tracking-wider">Programs (Teens) — Service Statistics</h5>
                            <div className="border border-indigo-500/30 rounded-xl overflow-hidden bg-background">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Session Name</th>
                                    <th className="p-2 border-r border-border text-center">Attendance</th>
                                    <th className="p-2 text-right font-bold">Offering (₦)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {teensSummary.map((t, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{t.sessionName} ({t.details})</td>
                                      <td className="p-2 border-r border-border text-center font-mono font-bold">{t.attendance.toLocaleString()}</td>
                                      <td className="p-2 text-right font-mono font-bold text-foreground">₦{t.offering.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Generic Custom Metrics Summary Table for other departments */}
                        {!isRegistration && !isUshering && !isMedical && !isWelfare && !isStores && !isSepu && !isBibleStudy && !isTeensProgram && customGroups.length > 0 && (
                          <div className="space-y-3 my-4 font-sans text-[12px]">
                            <h5 className="text-[12px] font-bold text-amber-400 uppercase tracking-wider">Operational Metrics Summary</h5>
                            <div className="border border-amber-500/30 rounded-xl overflow-hidden bg-background">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20 font-bold text-[10px]">
                                    <th className="p-2 border-r border-border">Category / Metric</th>
                                    <th className="p-2 border-r border-border">Metric Type</th>
                                    <th className="p-2 text-right font-bold">Cumulative Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground text-[11px]">
                                  {customGroups.map(group => group.items.map((item, idx) => (
                                    <tr key={`${group.groupKey}-${idx}`}>
                                      <td className="p-2 border-r border-border font-semibold text-foreground">{group.groupTitle} — {item.categoryOrName}</td>
                                      <td className="p-2 border-r border-border text-muted-foreground">{item.metricLabel}</td>
                                      <td className="p-2 text-right font-mono font-bold text-foreground">{item.value.toLocaleString()}</td>
                                    </tr>
                                  )))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 4. Challenges */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-foreground font-sans pb-1.5 border-b border-border">4. Consolidated Challenges &amp; Observations</h3>
                  <div className="space-y-2 text-[13px]">
                    {consolidated.challenges.length > 0 ? (
                      consolidated.challenges.map((ch, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                          <span className="font-mono font-bold text-amber-500 text-[11px] bg-amber-500/20 px-1.5 py-0.5 rounded shrink-0">
                            {ch.id ? `[${ch.id}]` : `[${ch.source}]`}
                          </span>
                          <div>
                            <span className="font-bold text-foreground font-sans block text-[12px]">{ch.departmentName}</span>
                            <span className="text-muted-foreground font-light">{ch.text}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="italic text-muted-foreground font-sans text-[13px]">No operational challenges logged by any department.</p>
                    )}
                  </div>
                </div>

                {/* 5. Recommendations */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-foreground font-sans pb-1.5 border-b border-border">5. Strategic Recommendations &amp; Corrective Actions</h3>
                  <div className="space-y-2 text-[13px]">
                    {consolidated.recommendations.length > 0 ? (
                      consolidated.recommendations.map((rec, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-start gap-2">
                          <span className="font-mono font-bold text-teal-400 text-[11px] bg-teal-500/20 px-1.5 py-0.5 rounded shrink-0">
                            [{rec.source}]
                          </span>
                          <div>
                            <span className="font-bold text-foreground font-sans block text-[12px]">{rec.departmentName}</span>
                            <span className="text-muted-foreground font-light">{rec.text}</span>
                            {rec.linkedChallengeId && (
                              <span className="text-[11px] text-amber-400 italic block mt-0.5 font-sans">
                                (Linked to Challenge {rec.linkedChallengeId})
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="italic text-muted-foreground font-sans text-[13px]">No strategic recommendations logged by any department.</p>
                    )}
                  </div>
                </div>

                {/* 6. Income & Expenditure Summary */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-foreground font-sans pb-1.5 border-b border-border">6. Income &amp; Expenditure Summary</h3>
                  <p className="text-[13px] text-muted-foreground font-light mb-2">
                    Financial breakdown of worship offerings and registration fees collected across reporting departments.
                  </p>
                  {offeringBreakdown.length > 0 ? (
                    <div className="border border-border rounded-xl overflow-hidden font-sans text-[12px] bg-background">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="font-bold border-b border-border text-foreground bg-muted/40">
                            <th className="p-2.5 border-r border-border">Department</th>
                            <th className="p-2.5 border-r border-border text-right">Worship Offering</th>
                            <th className="p-2.5 border-r border-border text-right">Registration Fees</th>
                            <th className="p-2.5 text-right font-bold">Total (₦)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-muted-foreground">
                          {offeringBreakdown.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                              <td className="p-2.5 border-r border-border font-semibold text-foreground">{row.departmentName}</td>
                              <td className="p-2.5 border-r border-border text-right font-mono">{row.worshipOffering > 0 ? `₦${row.worshipOffering.toLocaleString()}` : '—'}</td>
                              <td className="p-2.5 border-r border-border text-right font-mono">{row.registrationFees > 0 ? `₦${row.registrationFees.toLocaleString()}` : '—'}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-foreground">₦{row.totalFinancial.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[12px] italic text-muted-foreground">No financial data recorded yet.</p>
                  )}
                </div>

                {/* 7. Appreciation & Approvals */}
                <div className="space-y-4 pt-4 border-t border-border font-sans">
                  <h3 className="text-[15px] font-bold text-foreground pb-1.5">7. Appreciation &amp; Secretariat Approvals</h3>
                  <p className="text-[13px] text-muted-foreground font-light">
                    We express our profound gratitude to the National Coordinators, HODs, and Secretariat volunteers whose tireless execution kept convention reporting running seamlessly under offline settings.
                  </p>
                  <div className="grid grid-cols-2 gap-4 pt-4 text-[12px] font-semibold text-foreground">
                    <div>Secretariat General Approval: ___________________</div>
                    <div>National Competitions Rep: ___________________</div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

      </main>

      {/* ━━ STORES REQUISITION & MATERIALS FLOW AUDIT MODAL ━━ */}
      {showStoresModal && (() => {
        const storesReport = compileStrategicStoresReport(storeRequests, reports, departments, eventDays)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-card border border-amber-500/40 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              
              {/* Modal Header */}
              <div className="p-4 md:p-6 border-b border-border bg-amber-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground font-sans">
                      Stores Requisition &amp; Materials Flow Strategic Audit
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Standalone executive audit report • {event?.name || 'Convention'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStoresModal(false)}
                  className="h-8 w-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 md:p-6 overflow-y-auto space-y-6 flex-1 text-xs font-sans">
                
                {/* 1. Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-amber-400">Total Requisitions</div>
                    <div className="text-xl font-extrabold text-foreground font-mono">{storesReport.kpis.totalRequisitions}</div>
                    <div className="text-[10px] text-muted-foreground">{storesReport.kpis.totalDepartmentsRequesting} departments</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-emerald-400">Fulfillment Rate</div>
                    <div className="text-xl font-extrabold text-emerald-400 font-mono">{storesReport.kpis.fulfillmentRate}%</div>
                    <div className="text-[10px] text-muted-foreground">{storesReport.kpis.deliveredCount} delivered</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-blue-400">Items Requested</div>
                    <div className="text-xl font-extrabold text-foreground font-mono">{storesReport.kpis.totalItemsRequested.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">total material units</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-teal-400">Items Approved</div>
                    <div className="text-xl font-extrabold text-teal-400 font-mono">{storesReport.kpis.totalItemsApproved.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">total material units</div>
                  </div>
                </div>

                {/* 2. Department Demand Ranking */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">1. Departmental Material Demand Ranking</h3>
                  <div className="border border-border rounded-xl overflow-hidden bg-background">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 font-bold text-muted-foreground">
                          <th className="p-2 border-r border-border">Department Name</th>
                          <th className="p-2 border-r border-border text-center">Requests</th>
                          <th className="p-2 border-r border-border text-center font-bold">Units Requested</th>
                          <th className="p-2 border-r border-border text-center text-emerald-400 font-bold">Units Approved</th>
                          <th className="p-2 text-right">Fulfillment (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-muted-foreground">
                        {storesReport.departmentDemand.map((d, idx) => (
                          <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                            <td className="p-2 border-r border-border font-bold text-foreground">{d.departmentName}</td>
                            <td className="p-2 border-r border-border text-center font-mono">{d.totalRequests}</td>
                            <td className="p-2 border-r border-border text-center font-mono font-bold text-foreground">{d.totalUnitsRequested.toLocaleString()}</td>
                            <td className="p-2 border-r border-border text-center font-mono font-bold text-emerald-400">{d.totalUnitsApproved.toLocaleString()}</td>
                            <td className="p-2 text-right font-mono font-bold">{d.fulfillmentRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Item Velocity & Consumption Index */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider">2. Material Velocity &amp; Item-Level Consumption Index</h3>
                  <div className="border border-border rounded-xl overflow-hidden bg-background">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 font-bold text-muted-foreground">
                          <th className="p-2 border-r border-border">Item Name</th>
                          <th className="p-2 border-r border-border">Category</th>
                          <th className="p-2 border-r border-border text-center">Requested</th>
                          <th className="p-2 border-r border-border text-center font-bold text-teal-400">Approved</th>
                          <th className="p-2 text-right">Approval Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-muted-foreground">
                        {storesReport.itemVelocity.map((item, idx) => (
                          <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                            <td className="p-2 border-r border-border font-bold text-foreground">{item.itemName}</td>
                            <td className="p-2 border-r border-border">{item.category}</td>
                            <td className="p-2 border-r border-border text-center font-mono">{item.totalRequested.toLocaleString()} {item.unit}</td>
                            <td className="p-2 border-r border-border text-center font-mono font-bold text-teal-400">{item.totalApproved.toLocaleString()} {item.unit}</td>
                            <td className={`p-2 text-right font-mono font-bold ${item.shortageFlag ? 'text-amber-400' : 'text-foreground'}`}>
                              {item.approvalRatio}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Strategic Recommendations */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">3. Strategic Recommendations &amp; Material Flow Audit</h3>
                  <div className="space-y-2">
                    {storesReport.recommendations.map((rec, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-teal-950/20 border border-teal-500/30 text-muted-foreground leading-relaxed">
                        <strong className="text-teal-400 font-semibold">{idx + 1}. </strong>{rec}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                <button
                  onClick={() => setShowStoresModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 cursor-pointer"
                >
                  Close Preview
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportStoresCsv}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground bg-card border border-border hover:bg-muted/40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" /> Export CSV
                  </button>
                  <button
                    onClick={handleExportStoresDocx}
                    disabled={exportingStores}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Standalone DOCX
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      })()}
    </div>
  )
}
