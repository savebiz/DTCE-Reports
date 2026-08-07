'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getClient, isMock, mockDepartments } from '@/utils/supabase'
import { LayoutGrid, FileText, BarChart2, Users, LogOut, Menu, X, ShoppingCart, Boxes, Settings, FileEdit, Layers, Award, MessageSquare } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { NotificationBell } from '@/components/notification-bell'
import { EndofConventionFeedbackModal } from '@/components/EndofConventionFeedbackModal'

const NAV_ITEMS = [
  { label: 'Overview',            href: '/dashboard',                     icon: LayoutGrid },
  { label: 'YoY Analytics',       href: '/dashboard/yoy',                 icon: BarChart2  },
  { label: 'Requisitions',        href: '/dashboard/store-requisitions',  icon: ShoppingCart },
  { label: 'Inventory Oversight', href: '/dashboard?tab=inventory-oversight', icon: Layers },
  { label: 'Dept Rankings',       href: '/dashboard?tab=rankings',        icon: Award },
  { label: 'Manual Entry',        href: '/dashboard/manual-entry',        icon: FileEdit   },
  { label: 'Reports',             href: '/dashboard/reports',             icon: FileText   },
  { label: 'Team',                href: '/dashboard/team',                icon: Users      },
  { label: 'Convention Feedback', href: '/dashboard/feedback',            icon: MessageSquare },
  { label: 'Settings',            href: '/dashboard/settings',            icon: Settings   },
]

const DEPT_NAV_ITEMS = [
  { label: 'Department Home',      href: '/my-department',                  icon: LayoutGrid },
  { label: 'Daily Logs Workspace',  href: '/my-department/daily-log',        icon: FileEdit   },
  { label: 'Manual Paper Entry',   href: '/dashboard/manual-entry',         icon: FileEdit   },
  { label: 'Inventory Catalog',    href: '/my-department/inventory',        icon: Boxes      },
  { label: 'Store Requests',       href: '/my-department/store-request',    icon: ShoppingCart },
  { label: 'Fulfillment Console',  href: '/my-department/store-fulfillment',icon: ShoppingCart },
  { label: 'Event Narrative',      href: '/my-department/narrative',        icon: FileText   },
  { label: 'Manage Team',          href: '/my-department/team',             icon: Users      },
  { label: 'Settings',             href: '/dashboard/settings',             icon: Settings   },
]

const ROLE_LABELS: Record<string, string> = {
  super_admin:  'Admin',
  national_coordinator: 'Nat. Coordinator',
  coordinator:  'Coordinator',
  hod:          'HOD',
  assistant:    'Assistant',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  national_coordinator: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  coordinator:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  hod:          'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  assistant:    'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

export function DashboardHeader() {
  const router   = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const deptIdParam = searchParams?.get('deptId')

  const [user, setUser]     = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [open, setOpen]     = useState(false)
  const [signing, setSigning] = useState(false)
  const [activeDeptName, setActiveDeptName] = useState('Secretariat')
  const [hasNoDepartment, setHasNoDepartment] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  const checkFeedbackTrigger = (userProfile: any) => {
    if (!userProfile?.id) return
    // Permanent gate check: non-null feedback_submitted_at means NEVER show again
    if (userProfile.feedback_submitted_at) {
      setShowFeedbackModal(false)
      return
    }
    // 4-hour Snooze check (handles users who don't log out on mobile or desktop)
    if (typeof window !== 'undefined') {
      const snoozedUntil = sessionStorage.getItem('dtce_feedback_snoozed_until')
      if (snoozedUntil && Date.now() < Number(snoozedUntil)) {
        setShowFeedbackModal(false)
        return
      }
    }
    setShowFeedbackModal(true)
  }

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = getClient()
      const { data } = await supabase.auth.getUser()
      if (data?.user) {
        setUser(data.user)
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle()
        
        let activeProfile: any = prof
        if (prof) {
          setProfile(prof)
        } else {
          const meta = (data.user.user_metadata || {}) as any
          activeProfile = {
            id: data.user.id,
            role: meta.role || 'hod',
            department_id: meta.department_id || 'dept-10'
          }
        }

        // Check End-of-Convention Feedback modal trigger for current session/profile
        checkFeedbackTrigger(activeProfile)

        // Auto-bind browser push subscription to active user profile ID
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && activeProfile?.id) {
          navigator.serviceWorker.ready.then(async (reg) => {
            const sub = await reg.pushManager.getSubscription()
            if (sub) {
              fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  subscription: sub.toJSON(),
                  profileId: activeProfile.id
                })
              }).catch(() => {})
            }
          }).catch(() => {})
        }

        const userRole = activeProfile?.role || 'hod'
        let deptId = deptIdParam
        if (userRole === 'super_admin' || userRole === 'coordinator' || userRole === 'national_coordinator') {
          if (!deptIdParam) {
            setActiveDeptName(userRole === 'national_coordinator' ? "National Coordinator's Office" : 'Secretariat')
            return
          }
        } else {
          if (!deptId || deptId.startsWith('dept-')) {
            if (!isMock && activeProfile?.id) {
              const { data: assignment } = await supabase
                .from('hod_assignments')
                .select('department_id')
                .eq('profile_id', activeProfile.id)
                .maybeSingle()
              if (assignment?.department_id) {
                deptId = assignment.department_id
              }
            }
            if (!deptId) {
              deptId = activeProfile?.department_id
            }
            if (!deptId && userRole === 'assistant') {
              setHasNoDepartment(true)
            }
          }
        }

        if (deptId) {
          const { data: dbDept } = await supabase
            .from('departments')
            .select('name')
            .eq('id', deptId)
            .maybeSingle()
          if (dbDept?.name) {
            setActiveDeptName(dbDept.name)
          } else {
            const mockDept = mockDepartments.find(d => d.id === deptId)
            setActiveDeptName(mockDept?.name || 'Department')
          }
        } else {
          if (userRole === 'national_coordinator' || (userRole === 'assistant' && !deptId)) {
            setActiveDeptName("National Coordinator's Office")
          } else {
            setActiveDeptName(userRole === 'super_admin' || userRole === 'coordinator' ? 'Secretariat' : 'Department')
          }
        }
      }
    }
    fetchUser()
  }, [deptIdParam, profile?.department_id])

  // PWA app-resume / visibilitychange & window focus listener for mobile & desktop
  useEffect(() => {
    if (!profile || profile.feedback_submitted_at) return
    const handleResumeCheck = () => {
      if (document.visibilityState === 'visible') {
        checkFeedbackTrigger(profile)
      }
    }
    document.addEventListener('visibilitychange', handleResumeCheck)
    window.addEventListener('focus', handleResumeCheck)
    return () => {
      document.removeEventListener('visibilitychange', handleResumeCheck)
      window.removeEventListener('focus', handleResumeCheck)
    }
  }, [profile])

  const handleCloseFeedbackSession = () => {
    if (typeof window !== 'undefined') {
      // Snooze for 4 hours instead of infinite session lock
      sessionStorage.setItem('dtce_feedback_snoozed_until', (Date.now() + 4 * 60 * 60 * 1000).toString())
    }
    setShowFeedbackModal(false)
  }

  const handleSubmitFeedbackSuccess = () => {
    const nowIso = new Date().toISOString()
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('dtce_feedback_snoozed_until')
    }
    setProfile((prev: any) => ({
      ...prev,
      feedback_submitted_at: nowIso
    }))
    setShowFeedbackModal(false)
  }

  const handleSignOut = async () => {
    setSigning(true)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('dtce_feedback_snoozed_until')
    }
    const supabase = getClient()
    await supabase.auth.signOut()
    // Clear mock cookie
    document.cookie = 'sb-mock-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/login'
  }

  if (!user) return null

  const name    = profile?.full_name || user.user_metadata?.full_name || user.email || ''
  const role    = profile?.role || user.user_metadata?.role || 'assistant'
  const showNav = role === 'super_admin' || role === 'coordinator' || role === 'national_coordinator'

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  const isNavItemActive = (href: string) => {
    if (href.includes('tab=')) {
      const targetTab = href.split('tab=')[1]
      return pathname === '/dashboard' && searchParams?.get('tab') === targetTab
    }
    if (href === '/dashboard') {
      return pathname === '/dashboard' && !searchParams?.get('tab')
    }
    return pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
  }

  return (
    <>
      {/* ── FIXED FLOATING GLASSMORPHISM TOP NAVIGATION BAR ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 w-full overflow-x-clip"
        style={{
          background:           'rgba(10, 24, 38, 0.82)',
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:         '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow:            '0 8px 32px rgba(0, 0, 0, 0.37)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-3 md:px-6 w-full">

          {/* Left — Logo + Department Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <button
              onClick={() => router.push(showNav ? '/dashboard' : '/my-department')}
              className="flex items-center gap-2 group cursor-pointer"
            >
              <div
                className="relative flex-shrink-0 h-8 w-8 rounded-xl overflow-hidden animate-fade-in-up"
                style={{
                  background: '#fff',
                  boxShadow: '0 0 0 1px rgba(245,158,11,0.2), 0 0 12px rgba(245,158,11,0.08)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/dtce-logo.png"
                  alt="DTCE Junior Church Global"
                  width={32}
                  height={32}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 pulse-dot border-2 border-[#0A1826]" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--chrome-text)' }}>DTCE</span>
                <span className="text-[9px] font-medium tracking-widest uppercase" style={{ color: 'var(--chrome-text-muted)' }}>Reporting</span>
              </div>
            </button>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />
            <div className="hidden sm:inline-flex text-[10px] sm:text-[11px] font-bold text-amber-400 tracking-wider uppercase bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 sm:px-2.5 rounded-full select-none max-w-[130px] sm:max-w-[200px] lg:max-w-none truncate">
              {activeDeptName}
            </div>
          </div>

          {/* Right Controls (Strict Left-to-Right: 1. ThemeToggle, 2. NotificationBell, 3. Role/Avatar/SignOut, 4. Hamburger) */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* 1. Theme toggle FIRST */}
            <ThemeToggle compact />

            {/* 2. Notification Bell SECOND */}
            <NotificationBell userId={user?.id || profile?.id || (isMock ? 'mock-admin' : undefined)} />

            {/* Persistent Feedback Badge for mobile & desktop when feedback is pending */}
            {user && !profile?.feedback_submitted_at && (
              <button
                onClick={() => setShowFeedbackModal(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer shrink-0 animate-pulse"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(217,119,6,0.35))',
                  border: '1px solid rgba(245,158,11,0.5)',
                  color: '#FBBF24',
                  boxShadow: '0 0 10px rgba(245,158,11,0.2)'
                }}
                title="Give End-of-Convention Feedback"
              >
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Feedback</span>
              </button>
            )}

            {/* Role badge (Desktop) */}
            <span className={`hidden lg:inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize tracking-wide ${ROLE_COLORS[role] || ROLE_COLORS.assistant}`}>
              {role === 'assistant' && hasNoDepartment ? 'Coord. Assistant' : (ROLE_LABELS[role] || role)}
            </span>

            {/* User avatar (Desktop) */}
            <div className="hidden lg:flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}
              >
                {initials || '?'}
              </div>
              <span className="hidden xl:block text-[12px] font-medium" style={{ color: 'var(--chrome-text-muted)' }}>
                {name.split(' ')[0]}
              </span>
            </div>

            {/* Settings button (Desktop) */}
            <button
              onClick={() => router.push('/dashboard/settings')}
              title="Settings"
              className="hidden lg:flex items-center justify-center rounded-lg border p-1.5 text-slate-400 transition-all duration-200 hover:text-white hover:bg-white/5 cursor-pointer"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <Settings size={15} />
            </button>

            {/* Sign out button (Desktop) */}
            <button
              onClick={handleSignOut}
              disabled={signing}
              className="hidden lg:flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all duration-200 cursor-pointer"
              style={{
                background:   'transparent',
                borderColor:  'rgba(255,255,255,0.1)',
                color:        'var(--chrome-text-muted)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'rgba(239,68,68,0.4)'
                el.style.color = '#FCA5A5'
                el.style.background = 'rgba(239,68,68,0.06)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'rgba(255,255,255,0.1)'
                el.style.color = 'var(--chrome-text-muted)'
                el.style.background = 'transparent'
              }}
            >
              <LogOut size={13} />
              <span>{signing ? 'Signing out…' : 'Sign out'}</span>
            </button>

            {/* Mobile / Tablet Hamburger Trigger (Visible on Mobile & Tablet ONLY, hidden on Desktop & Laptop) */}
            <button
              className="flex lg:hidden items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:text-white cursor-pointer"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={() => setOpen(o => !o)}
              aria-label="Toggle Mobile Navigation Drawer"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── DESKTOP & LAPTOP LEFT VERTICAL RAIL (Supabase-Style Hover Expansion) ── */}
      {showNav && (
        <aside
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`hidden lg:flex fixed left-0 top-14 bottom-0 z-40 flex-col justify-between transition-all duration-300 ease-out border-r ${
            isHovered ? 'w-56 shadow-2xl' : 'w-14'
          }`}
          style={{
            background:           'rgba(10, 24, 38, 0.96)',
            backdropFilter:       'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderColor:          'rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex flex-col gap-1.5 p-2 overflow-y-auto overflow-x-hidden scrollbar-hide">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              /**
               * Governing Principle: National Coordinator's permission set must always be a strict superset of Coordinator's.
               * Any new feature granted to National Coordinator must be deliberately evaluated for whether Coordinator also needs it — never assume inheritance.
               */
              if (label === 'Convention Feedback' && role !== 'super_admin') return null;
              if (role === 'coordinator' && ['Inventory Oversight', 'Team', 'Reports', 'Manual Entry', 'YoY Analytics'].includes(label)) return null;
              if (role === 'national_coordinator' && ['Team', 'Reports', 'Manual Entry'].includes(label)) return null;
              const active = isNavItemActive(href)

              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  title={!isHovered ? label : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl p-2.5 text-[13px] font-semibold transition-all duration-200 cursor-pointer ${
                    active
                      ? 'text-white bg-blue-600/20 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon size={18} className={`shrink-0 ${active ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                  
                  {/* Text Label revealed smoothly on hover */}
                  <span
                    className={`whitespace-nowrap transition-opacity duration-200 ${
                      isHovered ? 'opacity-100 block' : 'opacity-0 hidden'
                    }`}
                  >
                    {label}
                  </span>

                  {/* Active Indicator Bar when collapsed */}
                  {active && !isHovered && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-500" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer inside expanded dock */}
          <div className={`p-3 border-t border-white/10 ${isHovered ? 'block' : 'hidden'}`}>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              DTCE Oversight Portal
            </span>
          </div>
        </aside>
      )}

      {/* ── MOBILE & TABLET RIGHT-SLIDING DRAWER (50% Width + Blurred Backdrop) ── */}
      {open && (
        <>
          {/* Blurred Translucent Overlay */}
          <div
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md lg:hidden animate-fade-in-up"
            onClick={() => setOpen(false)}
          />

          {/* Right Sliding Drawer Panel */}
          <aside
            className="fixed inset-y-0 right-0 z-[100] w-[75vw] sm:w-[50%] max-w-[320px] h-full shadow-2xl lg:hidden flex flex-col justify-between overflow-y-auto animate-fade-in-up"
            style={{
              background:     'rgba(10, 24, 38, 0.98)',
              backdropFilter: 'blur(24px)',
              borderLeft:     '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="p-4 space-y-4">
              {/* Drawer Top Header (Profile Details) */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}
                  >
                    {initials || '?'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-200 block truncate">{name}</span>
                    <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider truncate block">{activeDeptName}</span>
                  </div>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Role Badge in Drawer */}
              <div className="px-1">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${ROLE_COLORS[role] || ROLE_COLORS.assistant}`}>
                  {role === 'assistant' && hasNoDepartment ? 'Coord. Assistant' : (ROLE_LABELS[role] || role)}
                </span>
              </div>

              {/* Vertical Navigation List (Role-Aware) */}
              <nav className="flex flex-col gap-1.5 pt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-1">
                  Navigation Menu
                </span>
                
                {showNav ? (
                  /* Admin / Coordinator / Nat Coordinator Nav Links */
                  NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                    if (label === 'Convention Feedback' && role !== 'super_admin') return null;
                    if (role === 'coordinator' && ['Inventory Oversight', 'Team', 'Reports', 'Manual Entry', 'YoY Analytics'].includes(label)) return null;
                    if (role === 'national_coordinator' && ['Team', 'Reports', 'Manual Entry'].includes(label)) return null;
                    const active = isNavItemActive(href)
                    return (
                      <button
                        key={href}
                        onClick={() => { router.push(href); setOpen(false) }}
                        className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all cursor-pointer"
                        style={{
                          color:      active ? '#F1F5F9' : '#94A3B8',
                          background: active ? 'rgba(59,130,246,0.14)' : 'transparent',
                          border:     active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                        }}
                      >
                        <Icon size={16} className={active ? 'text-blue-400' : 'text-slate-400'} />
                        {label}
                      </button>
                    )
                  })
                ) : (
                  /* HOD & Assistant Department Quick Nav Links */
                  DEPT_NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                    const isStoresDept = activeDeptName.toLowerCase().includes('store')
                    const isSecretariatDept = activeDeptName.toLowerCase().includes('secretariat')
                    // Hide fulfillment console and inventory catalog for non-stores departments
                    if (label === 'Fulfillment Console' && !isStoresDept) return null;
                    if (label === 'Inventory Catalog' && !isStoresDept) return null;
                    if (label === 'Manual Paper Entry' && !isSecretariatDept) return null;
                    const active = pathname === href || (href !== '/my-department' && pathname?.startsWith(href))
                    return (
                      <button
                        key={href}
                        onClick={() => { router.push(href); setOpen(false) }}
                        className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all cursor-pointer"
                        style={{
                          color:      active ? '#F1F5F9' : '#94A3B8',
                          background: active ? 'rgba(59,130,246,0.14)' : 'transparent',
                          border:     active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                        }}
                      >
                        <Icon size={16} className={active ? 'text-blue-400' : 'text-slate-400'} />
                        {label}
                      </button>
                    )
                  })
                )}
              </nav>
            </div>

            {/* Bottom Actions inside Drawer (Sign Out) */}
            <div className="p-4 border-t border-white/10 space-y-3">
              <button
                onClick={handleSignOut}
                disabled={signing}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer"
              >
                <LogOut size={15} />
                <span>{signing ? 'Signing out…' : 'Sign Out of Account'}</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* End-of-Convention Feedback Modal */}
      <EndofConventionFeedbackModal
        isOpen={showFeedbackModal}
        profileId={profile?.id || user?.id}
        onCloseSession={handleCloseFeedbackSession}
        onSubmitSuccess={handleSubmitFeedbackSuccess}
      />
    </>
  )
}
