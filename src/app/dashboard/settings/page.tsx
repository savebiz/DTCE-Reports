'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bell, Mail, Smartphone, ShieldCheck, Check, AlertCircle, Share, PlusSquare, Info } from 'lucide-react'
import { getVapidPublicKey } from '@/lib/notifications/webpush'

interface LookupItem {
  id: string
  name: string
  created_at: string
}

interface CategoryPref {
  categoryKey: string
  title: string
  description: string
  types: string[]
  emailEnabled: boolean
  pushEnabled: boolean
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  try {
    const cleanStr = (base64String || '').trim()
    const padding = '='.repeat((4 - (cleanStr.length % 4)) % 4)
    const base64 = (cleanStr + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  } catch (err: any) {
    console.error('Invalid VAPID key base64 encoding:', err)
    throw new Error('VAPID public key encoding error.')
  }
}

function SettingsContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'notifications' | 'tribes' | 'diagnoses'>('notifications')

  // Lookup data lists
  const [tribes, setTribes] = useState<LookupItem[]>([])
  const [diagnoses, setDiagnoses] = useState<LookupItem[]>([])

  // Insertion Inputs
  const [newTribe, setNewTribe] = useState('')
  const [newDiagnosis, setNewDiagnosis] = useState('')

  // Notification Preferences State
  const [categories, setCategories] = useState<CategoryPref[]>([
    {
      categoryKey: 'requisitions',
      title: 'Store Requisitions Lifecycle',
      description: 'Alerts when store requests are submitted, approved, declined, or delivered.',
      types: ['requisition_submitted', 'requisition_approved', 'requisition_rejected', 'requisition_fulfilled', 'requisition_routed_to_stores'],
      emailEnabled: true,
      pushEnabled: true,
    },
    {
      categoryKey: 'stale_digests',
      title: 'Overdue Requisitions Digest',
      description: 'Batched summary notifications for requisitions pending review past 12 hours.',
      types: ['requisition_stale'],
      emailEnabled: true,
      pushEnabled: true,
    },
    {
      categoryKey: 'daily_reminders',
      title: 'Daily Collation Reminders',
      description: 'Cutoff alerts and daily departmental submission summaries.',
      types: ['missing_report_reminder', 'secretariat_summary'],
      emailEnabled: true,
      pushEnabled: true,
    },
  ])

  // Web Push State & Detection
  const [pushSupported, setPushSupported] = useState(false)
  const [isPushSubscribed, setIsPushSubscribed] = useState(false)
  const [isIosNotInstalled, setIsIosNotInstalled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  const loadData = async () => {
    const supabase = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !isMock) {
      router.push('/login')
      return
    }

    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (prof && prof.role !== 'super_admin' && prof.role !== 'coordinator' && prof.role !== 'national_coordinator') {
        // HODs can view notification preferences
        setActiveTab('notifications')
      }
      setProfile(prof)
    } else {
      setProfile({
        id: 'mock-admin',
        email: 'admin@dtce.org',
        full_name: 'Secretariat Admin',
        role: 'super_admin',
      } as Profile)
    }

    if (!isMock) {
      // Fetch tribes & diagnoses for admin
      const { data: tribesData } = await supabase.from('tribes').select('*').order('name', { ascending: true })
      setTribes(tribesData || [])

      const { data: diagnosesData } = await supabase.from('diagnoses').select('*').order('name', { ascending: true })
      setDiagnoses(diagnosesData || [])

      // Fetch Notification Preferences
      try {
        const res = await fetch('/api/notifications/preferences')
        const data = await res.json()
        if (data.preferences && Array.isArray(data.preferences)) {
          const userPrefsMap: Record<string, { email: boolean; push: boolean }> = {}
          data.preferences.forEach((p: any) => {
            userPrefsMap[p.notification_type] = {
              email: p.email_enabled !== false,
              push: p.push_enabled !== false,
            }
          })

          setCategories(prev =>
            prev.map(cat => {
              const primaryType = cat.types[0]
              if (userPrefsMap[primaryType]) {
                return {
                  ...cat,
                  emailEnabled: userPrefsMap[primaryType].email,
                  pushEnabled: userPrefsMap[primaryType].push,
                }
              }
              return cat
            })
          )
        }
      } catch (err) {
        console.warn('Failed to load user notification preferences:', err)
      }
    } else {
      setTribes([
        { id: 't-1', name: 'Reuben', created_at: '' },
        { id: 't-2', name: 'Simeon', created_at: '' },
        { id: 't-3', name: 'Judah', created_at: '' },
      ])
      setDiagnoses([
        { id: 'd-1', name: 'FEVER', created_at: '' },
        { id: 'd-2', name: 'RTI', created_at: '' },
        { id: 'd-3', name: 'DIARRHOEA', created_at: '' },
      ])
    }
  }

  useEffect(() => {
    loadData()

    // Web Push & Context Feature Detection
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase()
      const isIos = /iphone|ipad|ipod/.test(userAgent)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && (navigator as any).standalone === true)

      if (isIos && !isStandalone) {
        setIsIosNotInstalled(true)
        setPushSupported(false)
      } else if ('serviceWorker' in navigator && 'PushManager' in window) {
        setPushSupported(true)
        navigator.serviceWorker.ready.then(reg => {
          reg.pushManager.getSubscription().then(sub => {
            setIsPushSubscribed(!!sub)
          })
        })
      }
    }
  }, [])

  const handleTogglePreference = async (categoryKey: string, channel: 'email' | 'push', newValue: boolean) => {
    setCategories(prev =>
      prev.map(cat => {
        if (cat.categoryKey === categoryKey) {
          return {
            ...cat,
            [channel === 'email' ? 'emailEnabled' : 'pushEnabled']: newValue,
          }
        }
        return cat
      })
    )

    const targetCat = categories.find(c => c.categoryKey === categoryKey)
    if (!targetCat) return

    showToast(`Updated ${channel.toUpperCase()} preference for ${targetCat.title}`, 'success')

    if (!isMock) {
      for (const type of targetCat.types) {
        try {
          await fetch('/api/notifications/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notificationType: type,
              emailEnabled: channel === 'email' ? newValue : targetCat.emailEnabled,
              pushEnabled: channel === 'push' ? newValue : targetCat.pushEnabled,
            }),
          })
        } catch (err) {
          console.error('Failed to save preference:', err)
        }
      }
    }
  }

  const handleToggleWebPush = async () => {
    if (!pushSupported) return
    setPushLoading(true)

    try {
      const reg = await navigator.serviceWorker.ready

      if (isPushSubscribed) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
          await sub.unsubscribe()
        }
        setIsPushSubscribed(false)
        showToast('Web Push Notifications disabled on this device', 'success')
      } else {
        // Subscribe
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          showToast('Notification permission was denied in browser settings', 'error')
          setPushLoading(false)
          return
        }

        const vapidPublicKey = getVapidPublicKey()
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })

        setIsPushSubscribed(true)
        showToast('Web Push Notifications successfully enabled!', 'success')
      }
    } catch (err: any) {
      showToast(`Push subscription failed: ${err.message}`, 'error')
    } finally {
      setPushLoading(false)
    }
  }

  const handleAddTribe = async () => {
    if (!newTribe.trim()) return
    setLoading(true)
    const supabase = getClient()
    const name = newTribe.trim()

    if (isMock) {
      setTribes(prev => [...prev, { id: 't-mock-' + Math.random(), name, created_at: '' }].sort((a,b) => a.name.localeCompare(b.name)))
      setNewTribe('')
      showToast(`Tribe "${name}" added!`, 'success')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.from('tribes').insert({ name })
      if (error) throw error
      showToast(`Tribe "${name}" added to lookup tables!`, 'success')
      setNewTribe('')
      loadData()
    } catch (err: any) {
      showToast(`Failed to add tribe: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTribe = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove tribe "${name}"?`)) return
    setLoading(true)
    const supabase = getClient()

    if (isMock) {
      setTribes(prev => prev.filter(t => t.id !== id))
      showToast('Tribe removed successfully', 'success')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.from('tribes').delete().eq('id', id)
      if (error) throw error
      showToast('Tribe deleted from database!', 'success')
      loadData()
    } catch (err: any) {
      showToast(`Failed to delete tribe: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDiagnosis = async () => {
    if (!newDiagnosis.trim()) return
    setLoading(true)
    const supabase = getClient()
    const name = newDiagnosis.trim().toUpperCase()

    if (isMock) {
      setDiagnoses(prev => [...prev, { id: 'd-mock-' + Math.random(), name, created_at: '' }].sort((a,b) => a.name.localeCompare(b.name)))
      setNewDiagnosis('')
      showToast(`Diagnosis "${name}" added!`, 'success')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.from('diagnoses').insert({ name })
      if (error) throw error
      showToast(`Diagnosis "${name}" added to lookup tables!`, 'success')
      setNewDiagnosis('')
      loadData()
    } catch (err: any) {
      showToast(`Failed to add diagnosis: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveDiagnosis = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove diagnosis "${name}"?`)) return
    setLoading(true)
    const supabase = getClient()

    if (isMock) {
      setDiagnoses(prev => prev.filter(d => d.id !== id))
      showToast('Diagnosis removed successfully', 'success')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.from('diagnoses').delete().eq('id', id)
      if (error) throw error
      showToast('Diagnosis deleted from database!', 'success')
      loadData()
    } catch (err: any) {
      showToast(`Failed to delete diagnosis: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'coordinator' || profile?.role === 'national_coordinator'

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">System & Notification Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your operational alert preferences, Web Push notifications, and system lookup configurations.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-border pb-px overflow-x-auto">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'notifications'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bell size={14} />
            Notifications &amp; Web Push
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('tribes')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                  activeTab === 'tribes'
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Tribes List
              </button>
              <button
                onClick={() => setActiveTab('diagnoses')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                  activeTab === 'diagnoses'
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Diagnoses Options
              </button>
            </>
          )}
        </div>

        {/* ── TAB 1: NOTIFICATION PREFERENCES & WEB PUSH ── */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            {/* Device Web Push Status Card */}
            <Card className="glass-card border-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Smartphone size={16} className="text-blue-400" />
                    Device Web Push Status
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive instant push alerts on your phone or computer even when DTCE App is in the background.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isIosNotInstalled ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-bold">
                      <Info size={16} />
                      <span>iOS Safari Web Push Guidance</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Apple Safari on iOS restricts Web Push notifications until the app is added to your Home Screen. In-App Bell notifications and Email alerts remain <strong>100% active</strong>.
                    </p>
                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5 space-y-1.5 text-slate-300 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-400">1.</span>
                        <span>Tap <strong>Share <Share size={12} className="inline" /></strong> in Safari toolbar.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-400">2.</span>
                        <span>Tap <strong>Add to Home Screen <PlusSquare size={12} className="inline" /></strong>.</span>
                      </div>
                    </div>
                  </div>
                ) : pushSupported ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-card/40 border border-border/50">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${isPushSubscribed ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        <span className="text-xs font-bold text-slate-200">
                          {isPushSubscribed ? 'Web Push Active on this Device' : 'Web Push Inactive'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {isPushSubscribed
                          ? 'This device is registered to receive real-time push alerts for requisition lifecycle events.'
                          : 'Click below to grant browser permission and enable Web Push notifications on this device.'}
                      </p>
                    </div>
                    <Button
                      onClick={handleToggleWebPush}
                      disabled={pushLoading}
                      className={`text-xs font-bold shrink-0 ${
                        isPushSubscribed
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {pushLoading ? 'Processing...' : isPushSubscribed ? 'Disable Push on Device' : 'Enable Web Push'}
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-800/40 border border-border/50 text-xs text-muted-foreground flex items-center gap-2">
                    <AlertCircle size={16} className="text-slate-400 shrink-0" />
                    <span>Web Push Manager is not supported on this browser version. In-App and Email alerts remain active.</span>
                  </div>
                )}

                {/* Device & Platform Specific Notification Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-1">
                    <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                      <Info size={13} />
                      Android Sound &amp; Vibration Settings
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Android 8+ gates sound and vibration per-site via a device Notification Channel created when notifications are first granted. If notifications appear silently, check <strong>Phone Settings &rarr; Apps &rarr; Chrome/DTCE &rarr; Notifications</strong> and ensure sound and vibration are enabled.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-1">
                    <div className="text-[11px] font-bold text-purple-400 flex items-center gap-1.5">
                      <Info size={13} />
                      iOS Safari Vibration Notice
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      On installed iOS PWAs (iOS 16.4+), sound alerts play according to your device sound profile. Custom vibration pulse patterns are restricted by Apple iOS Safari system policy.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification Preference Categories */}
            <Card className="glass-card border-none">
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  Category Notification Channels
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure Email and Push delivery channels per category. In-App notifications are mandatory for audit oversight.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="divide-y divide-border/40 border border-border/50 rounded-xl overflow-hidden">
                  {categories.map(cat => (
                    <div key={cat.categoryKey} className="p-4 bg-card/30 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-foreground">{cat.title}</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{cat.description}</p>
                        </div>
                      </div>

                      {/* Channel Controls Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        {/* In-App Baseline Channel (Mandatory) */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/40 border border-border/40">
                          <div className="flex items-center gap-2">
                            <Bell size={14} className="text-amber-400" />
                            <span className="text-xs font-semibold text-foreground">In-App Bell</span>
                          </div>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <Check size={10} /> Required
                          </span>
                        </div>

                        {/* Email Channel Toggle */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/40 border border-border/40">
                          <div className="flex items-center gap-2">
                            <Mail size={14} className="text-blue-400" />
                            <span className="text-xs font-semibold text-foreground">Email Alert</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cat.emailEnabled}
                              onChange={(e) => handleTogglePreference(cat.categoryKey, 'email', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {/* Push Channel Toggle */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/40 border border-border/40">
                          <div className="flex items-center gap-2">
                            <Smartphone size={14} className="text-purple-400" />
                            <span className="text-xs font-semibold text-foreground">Web Push</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cat.pushEnabled}
                              onChange={(e) => handleTogglePreference(cat.categoryKey, 'push', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── TAB 2 & 3: LOOKUP TABLES (TRIBES & DIAGNOSES) ── */}
        {activeTab !== 'notifications' && isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main List Column */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass-card border-none">
                <CardHeader>
                  <div className="text-base font-bold text-foreground uppercase tracking-wider">
                    {activeTab === 'tribes' ? 'Registered Tribes' : 'Configured Diagnoses'}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeTab === 'tribes' ? (
                      tribes.map(t => (
                        <div key={t.id} className="flex justify-between items-center bg-background/25 border border-border p-3 rounded-xl text-sm text-foreground">
                          <span className="font-semibold">{t.name}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleRemoveTribe(t.id, t.name)}>
                            ✕
                          </Button>
                        </div>
                      ))
                    ) : (
                      diagnoses.map(d => (
                        <div key={d.id} className="flex justify-between items-center bg-background/25 border border-border p-3 rounded-xl text-sm text-foreground">
                          <span className="font-semibold">{d.name}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleRemoveDiagnosis(d.id, d.name)}>
                            ✕
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Add Item Column */}
            <div className="lg:col-span-1">
              <Card className="glass-card border-none">
                <CardHeader>
                  <div className="text-base font-bold text-foreground uppercase tracking-wider">
                    Add New Option
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeTab === 'tribes' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="tribe-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Tribe Name</Label>
                        <Input
                          id="tribe-name"
                          value={newTribe}
                          onChange={(e) => setNewTribe(e.target.value)}
                          placeholder="e.g. Issachar"
                          className="input-dark text-foreground"
                        />
                      </div>
                      <Button onClick={handleAddTribe} disabled={loading} className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                        {loading ? 'Adding...' : 'Add Tribe Option'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="diag-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Diagnosis Name</Label>
                        <Input
                          id="diag-name"
                          value={newDiagnosis}
                          onChange={(e) => setNewDiagnosis(e.target.value)}
                          placeholder="e.g. MALARIA"
                          className="input-dark text-foreground"
                        />
                      </div>
                      <Button onClick={handleAddDiagnosis} disabled={loading} className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                        {loading ? 'Adding...' : 'Add Diagnosis Option'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-muted-foreground">Loading settings console...</p>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}
