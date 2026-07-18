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
    <div className="min-h-screen bg-mesh" style={{ background: '#06090F' }}>
      <DashboardHeader />

      {/* Heading Block */}
      <div className="border-b" style={{ background: 'rgba(6,9,15,0.7)', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between py-6 px-4 md:px-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Secretariat Panel</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Report Generation &amp; Export
            </h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Dynamic document builder with Word DOCX compilation.
            </p>
          </div>
          
          <div className="flex items-center">
            <Link href="/dashboard">
              <button
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              >
                ➔ Oversight Grid Matrix
              </button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in-up">
        
        {/* Left Side: Export Settings & Notifications (1 col) */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Card 1: Export Settings */}
          <div className="glass-card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Export Settings</h2>
            <p className="text-[12px] text-slate-500 mb-4">Configure file labeling and download options.</p>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="version-label" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Version/Revision Label
                </label>
                <input
                  id="version-label"
                  value={exportLabel}
                  onChange={(e) => setExportLabel(e.target.value)}
                  placeholder="e.g. First Draft, Final Version 1"
                  className="input-dark h-9 text-[13px]"
                />
              </div>

              <div className="p-3.5 rounded-xl text-[12px] text-slate-400 space-y-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> Branded Letterhead</p>
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> Embedded Tables</p>
                <p className="flex items-center gap-2"><span className="text-emerald-400 font-bold">✓</span> Aggregated Summaries</p>
              </div>

              <button
                onClick={handleExportDocx}
                disabled={exporting}
                className="w-full rounded-xl py-2.5 text-[13px] font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)', border: '1px solid rgba(59,130,246,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                {exporting ? 'Generating...' : '📥 Export Branded DOCX'}
              </button>
            </div>
          </div>

          {/* Card 2: Daily Reminders */}
          <div className="glass-card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">🔔 Daily Reminders</h2>
            <p className="text-[12px] text-slate-500 mb-4">Send reminders to HODs and collation logs to Secretariat.</p>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="digest-day" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Target Day</label>
                <select
                  id="digest-day"
                  value={digestDay}
                  onChange={(e) => setDigestDay(e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-[13px] font-medium text-slate-300 cursor-pointer"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    outline: 'none',
                  }}
                >
                  <option value="1" style={{ background: '#111827' }}>Day 1</option>
                  <option value="2" style={{ background: '#111827' }}>Day 2</option>
                  <option value="3" style={{ background: '#111827' }}>Day 3</option>
                  <option value="4" style={{ background: '#111827' }}>Day 4</option>
                  <option value="5" style={{ background: '#111827' }}>Day 5</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="digest-cutoff" className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Cutoff Time</label>
                <input
                  id="digest-cutoff"
                  value={digestCutoff}
                  onChange={(e) => setDigestCutoff(e.target.value)}
                  placeholder="e.g. 18:00"
                  className="input-dark h-9 text-[13px]"
                />
              </div>

              <button
                onClick={handleTriggerDigest}
                disabled={sendingDigest}
                className="w-full rounded-xl py-2.5 text-[13px] font-bold text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F5F9' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              >
                {sendingDigest ? 'Sending Reminders...' : 'Trigger Daily Reminders'}
              </button>
            </div>
          </div>

          {/* Card 3: Simulated Email Logs */}
          <div className="glass-card p-5 max-h-[350px] flex flex-col">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">Simulated Email Logs</h2>
            <div className="overflow-y-auto pr-1 space-y-3 flex-1 scrollbar-hide text-[11px]">
              {notifLogs.slice().reverse().map((log) => (
                <div key={log.id} className="pb-3.5 space-y-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex justify-between text-slate-500 font-mono text-[10px]">
                    <span>To: {log.recipient}</span>
                    <span>{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <p className="font-semibold text-slate-300">{log.subject}</p>
                  <p className="text-slate-500 leading-tight p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {log.body.substring(0, 120)}...
                  </p>
                </div>
              ))}
              {notifLogs.length === 0 && (
                <p className="text-[12px] italic text-slate-600 text-center py-4">No notification logs recorded.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Document Preview Screen (3 cols) */}
        <div className="lg:col-span-3">
          <div className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="px-5 py-3.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Document Preview</span>
              </div>
            </div>
            
            <div className="overflow-y-auto px-8 py-10 flex-1 scrollbar-hide" style={{ background: '#090F1E' }}>
              <div className="max-w-3xl mx-auto space-y-8 text-slate-300 font-serif leading-relaxed" style={{ fontSize: '15px' }}>
                
                {/* Header Letterhead Preview */}
                <div className="flex flex-col items-center pb-6 text-center space-y-2.5 font-sans" style={{ borderBottom: '2px solid rgba(59,130,246,0.15)' }}>
                  <div className="h-14 w-14 flex items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xl font-bold font-mono">⛪</div>
                  <h3 className="text-[16px] font-bold text-white tracking-wide uppercase">THE REDEEMED CHRISTIAN CHURCH OF GOD</h3>
                  <h4 className="text-[12px] font-bold text-amber-400 uppercase tracking-widest">JUNIOR CHURCH GLOBAL SECRETARIAT</h4>
                  <p className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">{event?.name || 'CONVENTION REPORT'}</p>
                </div>

                {/* Title Section */}
                <div className="py-6 text-center space-y-2 font-sans">
                  <h2 className="text-2xl font-extrabold text-white tracking-tight">{event?.name || 'CONVENTION SUMMARY REPORT'}</h2>
                  <p className="text-[13px] text-slate-500 italic">Consolidated Administrative and Departmental Activity Log</p>
                </div>

                {/* 1. Executive Summary */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-white font-sans pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>1. Executive Summary</h3>
                  <p className="text-[14px] text-slate-400 font-light">
                    This consolidated report presents the administrative, attendance, and operational metrics of the Junior Church Global Secretariat during the {event?.name || 'Annual Convention'}. It compiles metrics from all 40 departments tasked with delegate management, welfare, medical care, and logistics.
                  </p>
                </div>

                {/* 2. General Attendance table */}
                <div className="space-y-4">
                  <h3 className="text-[15px] font-bold text-white font-sans pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>2. General Report of Activities</h3>
                  <p className="text-[12px] italic text-slate-500 font-sans">Day-by-Day general attendance logged across all department sections:</p>
                  <div className="border rounded-xl overflow-hidden font-sans text-[13px]" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-white font-bold" style={{ background: 'rgba(59,130,246,0.1)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <th className="p-3 border-r" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Convention Day</th>
                          <th className="p-3 border-r text-center font-tabular" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Avg Morning Attendance</th>
                          <th className="p-3 text-center font-tabular">Avg Evening Attendance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-400">
                        <tr>
                          <td className="p-3 border-r font-semibold text-slate-300" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Day 1</td>
                          <td className="p-3 border-r text-center font-mono font-bold" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>85</td>
                          <td className="p-3 text-center font-mono font-bold">120</td>
                        </tr>
                        <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                          <td className="p-3 border-r font-semibold text-slate-300" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Day 2</td>
                          <td className="p-3 border-r text-center font-mono font-bold" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>110</td>
                          <td className="p-3 text-center font-mono font-bold">155</td>
                        </tr>
                        <tr>
                          <td className="p-3 border-r font-semibold text-slate-300" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Day 3</td>
                          <td className="p-3 border-r text-center font-mono font-bold" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>130</td>
                          <td className="p-3 text-center font-mono font-bold">180</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Department narrative summaries */}
                <div className="space-y-6">
                  <h3 className="text-[15px] font-bold text-white font-sans pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>3. Selected Departmental Reports</h3>
                  
                  {eoeNarratives.length === 0 ? (
                    <p className="text-[13px] italic text-slate-600 font-sans">No departmental reports approved or drafted yet.</p>
                  ) : (
                    eoeNarratives.map((narr) => {
                      const dept = departments.find(d => d.id === narr.department_id)
                      const deptReps = reports.filter(r => r.department_id === narr.department_id)
                      return (
                        <div key={narr.id} className="space-y-3.5 pl-4 border-l-2" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
                          <h4 className="text-[14px] font-bold text-amber-400 font-sans">{dept?.name}</h4>
                          <p className="text-[14px] text-slate-400 font-light"><strong>Overview:</strong> {narr.overview}</p>
                          <p className="text-[14px] text-slate-400 font-light"><strong>Highlights:</strong> {narr.highlights}</p>
                          
                          {deptReps.length > 0 && (
                            <div className="border rounded-xl overflow-hidden font-sans text-[11px] w-full max-w-md my-3.5" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="font-bold border-b text-slate-500" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }}>
                                    <th className="p-2 border-r" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Day</th>
                                    <th className="p-2 border-r text-center font-tabular" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Morning</th>
                                    <th className="p-2 border-r text-center font-tabular" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Evening</th>
                                    <th className="p-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 text-slate-400">
                                  {deptReps.map((r, rIdx) => (
                                    <tr key={r.id}>
                                      <td className="p-2 border-r" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>Day {rIdx + 1}</td>
                                      <td className="p-2 border-r text-center font-mono font-semibold text-slate-300" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>{r.attendance_morning}</td>
                                      <td className="p-2 border-r text-center font-mono font-semibold text-slate-300" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>{r.attendance_evening}</td>
                                      <td className="p-2 text-center uppercase tracking-wider text-[9px] font-bold text-emerald-400">{r.status}</td>
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
                  <h3 className="text-[15px] font-bold text-white font-sans pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>4. Consolidated Challenges &amp; Observations</h3>
                  <ul className="list-disc pl-5 space-y-2 text-[14px] text-slate-400 font-light">
                    {eoeNarratives.map(narr => (narr.challenges_json || []).map((ch: any) => (
                      <li key={ch.id}>
                        <span className="font-semibold text-amber-400 font-mono mr-1">[{ch.id}]</span>
                        {ch.text}
                      </li>
                    )))}
                    {eoeNarratives.every(n => (n.challenges_json || []).length === 0) && (
                      <li className="italic text-slate-600 list-none font-sans text-[13px]">No challenges logged.</li>
                    )}
                  </ul>
                </div>

                {/* 5. Recommendations */}
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-white font-sans pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>5. Strategic Recommendations</h3>
                  <ul className="list-disc pl-5 space-y-2 text-[14px] text-slate-400 font-light">
                    {eoeNarratives.map(narr => (narr.recommendations_json || []).map((rec: any, idx: number) => (
                      <li key={idx}>
                        {rec.text}
                        {rec.linked_challenge_id && (
                          <span className="text-[11px] text-slate-600 italic font-sans ml-1">
                            (Linked to Challenge {rec.linked_challenge_id})
                          </span>
                        )}
                      </li>
                    )))}
                    {eoeNarratives.every(n => (n.recommendations_json || []).length === 0) && (
                      <li className="italic text-slate-600 list-none font-sans text-[13px]">No recommendations logged.</li>
                    )}
                  </ul>
                </div>

              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
