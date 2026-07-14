'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEventDays, mockEvents, Profile, DailyReport, Department } from '@/utils/supabase'
import { DashboardHeader } from '@/components/dashboard-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { store } from '@/utils/supabase/mockClient'
import Link from 'next/link'

export default function ReportsExportPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  
  // Datasets for preview
  const [event, setEvent] = useState<any>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [narratives, setNarratives] = useState<any[]>([])
  
  // Form controls
  const [exportLabel, setExportLabel] = useState('First Draft')
  const [exporting, setExporting] = useState(false)

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
      // Check authorization (Only Secretariat/super_admin/coordinator)
      if (prof.role !== 'super_admin' && prof.role !== 'coordinator') {
        router.push('/my-department')
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

      const { data: logs } = await supabase.from('notification_logs').select('*')
      setNotifLogs(logs || [])
    }
  }

  const handleTriggerDigest = async () => {
    setSendingDigest(true)
    try {
      const res = await fetch(`/api/send-digest?day=${digestDay}&cutoff=${encodeURIComponent(digestCutoff)}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert(`Successfully triggered daily digest reminders! Sent ${data.notifications_sent} emails in ${data.delivery_mode} mode.`)
        // Refresh logs list
        const supabase = getClient()
        const { data: logs } = await supabase.from('notification_logs').select('*')
        setNotifLogs(logs || [])
      } else {
        alert(`Error triggering digest: ${data.error}`)
      }
    } catch (err: any) {
      alert(`Digest failed: ${err.message}`)
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
    
    // Create temporary link and click it to trigger binary download stream
    const link = document.createElement('a')
    link.href = downloadUrl
    link.setAttribute('download', `${event?.name || 'DTCE_Convention'}_Report.docx`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    setTimeout(() => {
      setExporting(false)
      alert('Your branded DOCX report has been generated and is downloading!')
    }, 1500)
  }

  // Filter end-of-event reports
  const eoeNarratives = narratives.filter(n => n.is_end_of_event === true)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <DashboardHeader />

      {/* Heading Block */}
      <div className="bg-white border-b border-slate-200 dark:bg-slate-950 dark:border-slate-800 py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Report Generation & Export
            </h1>
            <p className="text-sm text-slate-500">
              Secretariat Panel • Dynamic document builder with Word DOCX compilation.
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                ➔ Oversight Grid Matrix
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Side: Export Settings & Notifications (1 col) */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Export Settings
              </CardTitle>
              <CardDescription>
                Configure file labeling and download options.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="version-label">Version/Revision Label</Label>
                <Input
                  id="version-label"
                  value={exportLabel}
                  onChange={(e) => setExportLabel(e.target.value)}
                  placeholder="e.g. First Draft, Final Version 1"
                  className="h-9 text-xs"
                />
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-md text-xs text-slate-500 space-y-2 border border-slate-100">
                <p>✓ <strong>Branded Letterhead</strong>: Navy & Gold accents.</p>
                <p>✓ <strong>Embedded Tables</strong>: Direct database metrics tables.</p>
                <p>✓ <strong>Aggregated Summaries</strong>: Grouped challenges and recommendations.</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleExportDocx}
                disabled={exporting}
                className="w-full bg-primary hover:bg-primary/95 text-white font-semibold"
              >
                {exporting ? 'Generating...' : '📥 Export Branded DOCX'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                🔔 Daily Reminders
              </CardTitle>
              <CardDescription>
                Send reminders to HODs and collation logs to Secretariat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="digest-day" className="text-xs font-semibold">Target Day</Label>
                <select
                  id="digest-day"
                  value={digestDay}
                  onChange={(e) => setDigestDay(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                >
                  <option value="1">Day 1</option>
                  <option value="2">Day 2</option>
                  <option value="3">Day 3</option>
                  <option value="4">Day 4</option>
                  <option value="5">Day 5</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="digest-cutoff" className="text-xs font-semibold">Cutoff Time</Label>
                <Input
                  id="digest-cutoff"
                  value={digestCutoff}
                  onChange={(e) => setDigestCutoff(e.target.value)}
                  placeholder="e.g. 18:00"
                  className="h-9 text-xs"
                />
              </div>

              <Button
                onClick={handleTriggerDigest}
                disabled={sendingDigest}
                variant="outline"
                className="w-full text-xs font-semibold h-9"
              >
                {sendingDigest ? 'Sending Reminders...' : '🔔 Trigger Daily Reminders'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm max-h-[40vh] flex flex-col">
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-bold uppercase text-slate-400">Simulated Email Logs</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto px-4 pb-4 space-y-3 flex-1 text-[10px]">
              {notifLogs.slice().reverse().map((log) => (
                <div key={log.id} className="border-b border-slate-100 dark:border-slate-800 pb-2 space-y-1">
                  <div className="flex justify-between text-slate-400 font-mono">
                    <span>To: {log.recipient}</span>
                    <span>{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">{log.subject}</p>
                  <p className="text-slate-500 whitespace-pre-wrap leading-tight bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded">{log.body.substring(0, 120)}...</p>
                </div>
              ))}
              {notifLogs.length === 0 && (
                <p className="text-xs italic text-slate-400 text-center py-4">No notification logs recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Document Preview Screen (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-lg bg-white overflow-hidden max-h-[85vh] flex flex-col">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/10 border-b border-slate-100 dark:border-slate-800 p-4">
              <CardTitle className="text-xs font-semibold uppercase text-slate-400">
                Document Preview (Secretariat Collation)
              </CardTitle>
            </CardHeader>
            
            <CardContent className="overflow-y-auto p-8 space-y-8 flex-1 text-slate-700 max-w-4xl mx-auto w-full font-serif leading-relaxed">
              
              {/* Header Letterhead Preview */}
              <div className="flex flex-col items-center border-b-2 border-primary/20 pb-6 text-center space-y-2 font-sans">
                <img src="/dtce-logo.png" alt="DTCE Logo" className="h-16 w-16" />
                <h3 className="text-lg font-bold text-primary tracking-tight">THE REDEEMED CHRISTIAN CHURCH OF GOD</h3>
                <h4 className="text-xs font-bold text-secondary uppercase tracking-widest">JUNIOR CHURCH GLOBAL SECRETARIAT</h4>
                <p className="text-xs text-slate-400 uppercase font-mono">{event?.name || 'CONVENTION REPORT'}</p>
              </div>

              {/* Title Section */}
              <div className="py-8 text-center space-y-2 font-sans">
                <h2 className="text-2xl font-extrabold text-primary">{event?.name || 'CONVENTION SUMMARY REPORT'}</h2>
                <p className="text-sm text-slate-500 italic">Consolidated Administrative and Departmental Activity Log</p>
              </div>

              {/* 1. Executive Summary */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-primary font-sans border-b border-slate-100 pb-1">1. Executive Summary</h3>
                <p className="text-sm">
                  This consolidated report presents the administrative, attendance, and operational metrics of the Junior Church Global Secretariat during the {event?.name || 'Annual Convention'}. It compiles metrics from all 40 departments tasked with delegate management, welfare, medical care, and logistics.
                </p>
              </div>

              {/* 2. General Attendance table */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-primary font-sans border-b border-slate-100 pb-1">2. General Report of Activities</h3>
                <p className="text-xs italic text-slate-500">Day-by-Day general attendance logged across all department sections:</p>
                <div className="border border-slate-200 rounded overflow-hidden font-sans text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-primary text-white font-bold">
                        <th className="p-2 border-r border-slate-200">Convention Day</th>
                        <th className="p-2 border-r border-slate-200 text-center">Avg Morning Attendance</th>
                        <th className="p-2 text-center">Avg Evening Attendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-2 border-r border-slate-200 font-semibold">Day 1</td>
                        <td className="p-2 border-r border-slate-200 text-center font-mono">85</td>
                        <td className="p-2 text-center font-mono">120</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="p-2 border-r border-slate-200 font-semibold">Day 2</td>
                        <td className="p-2 border-r border-slate-200 text-center font-mono">110</td>
                        <td className="p-2 text-center font-mono">155</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-r border-slate-200 font-semibold">Day 3</td>
                        <td className="p-2 border-r border-slate-200 text-center font-mono">130</td>
                        <td className="p-2 text-center font-mono">180</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Department narrative summaries */}
              <div className="space-y-6">
                <h3 className="text-base font-bold text-primary font-sans border-b border-slate-100 pb-1">3. Selected Departmental Reports</h3>
                
                {eoeNarratives.length === 0 ? (
                  <p className="text-sm italic text-slate-400">No departmental reports approved or drafted yet.</p>
                ) : (
                  eoeNarratives.map((narr) => {
                    const dept = departments.find(d => d.id === narr.department_id)
                    const deptReps = reports.filter(r => r.department_id === narr.department_id)
                    return (
                      <div key={narr.id} className="space-y-3 pl-4 border-l-2 border-secondary/30">
                        <h4 className="text-sm font-bold text-secondary font-sans">{dept?.name}</h4>
                        <p className="text-sm"><strong>Overview:</strong> {narr.overview}</p>
                        <p className="text-sm"><strong>Highlights:</strong> {narr.highlights}</p>
                        
                        {deptReps.length > 0 && (
                          <div className="border border-slate-200 rounded overflow-hidden font-sans text-[10px] w-full max-w-md my-2">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-100 font-bold border-b border-slate-200 text-slate-600">
                                  <th className="p-1.5 border-r border-slate-200">Day</th>
                                  <th className="p-1.5 border-r border-slate-200 text-center">Morning</th>
                                  <th className="p-1.5 border-r border-slate-200 text-center">Evening</th>
                                  <th className="p-1.5 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {deptReps.map((r, rIdx) => (
                                  <tr key={r.id}>
                                    <td className="p-1.5 border-r border-slate-200">Day {rIdx + 1}</td>
                                    <td className="p-1.5 border-r border-slate-200 text-center font-mono">{r.attendance_morning}</td>
                                    <td className="p-1.5 border-r border-slate-200 text-center font-mono">{r.attendance_evening}</td>
                                    <td className="p-1.5 text-center uppercase tracking-widest text-[8px] font-bold text-green-700">{r.status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* 4. Challenges */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-primary font-sans border-b border-slate-100 pb-1">4. Consolidated Challenges & Observations</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm">
                  {eoeNarratives.map(narr => (narr.challenges_json || []).map((ch: any) => (
                    <li key={ch.id}>
                      <span className="font-semibold text-secondary font-mono mr-1">[{ch.id}]</span>
                      {ch.text}
                    </li>
                  )))}
                  {eoeNarratives.every(n => (n.challenges_json || []).length === 0) && (
                    <li className="italic text-slate-400">No challenges logged.</li>
                  )}
                </ul>
              </div>

              {/* 5. Recommendations */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-primary font-sans border-b border-slate-100 pb-1">5. Strategic Recommendations</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm">
                  {eoeNarratives.map(narr => (narr.recommendations_json || []).map((rec: any, idx: number) => (
                    <li key={idx}>
                      {rec.text}
                      {rec.linked_challenge_id && (
                        <span className="text-xs text-slate-400 italic font-sans ml-1">
                          (Linked to Challenge {rec.linked_challenge_id})
                        </span>
                      )}
                    </li>
                  )))}
                  {eoeNarratives.every(n => (n.recommendations_json || []).length === 0) && (
                    <li className="italic text-slate-400">No recommendations logged.</li>
                  )}
                </ul>
              </div>

            </CardContent>
          </Card>
        </div>

      </main>
    </div>
  )
}
