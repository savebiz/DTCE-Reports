'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getClient, isMock, mockDepartments } from '@/utils/supabase'
import { LayoutGrid, FileText, BarChart2, Users, LogOut, Menu, X, PackageOpen, Settings } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const NAV_ITEMS = [
  { label: 'Overview',    href: '/dashboard',         icon: LayoutGrid },
  { label: 'Reports',     href: '/dashboard/reports', icon: FileText   },
  { label: 'YoY Analytics', href: '/dashboard/yoy',  icon: BarChart2  },
  { label: 'Requisitions', href: '/dashboard/store-requisitions', icon: PackageOpen },
  { label: 'Team',        href: '/dashboard/team',    icon: Users      },
  { label: 'Settings',    href: '/dashboard/settings', icon: Settings   },
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
          .single()
        
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

  const handleSignOut = async () => {
    setSigning(true)
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

  /* CHROME LAYER (theme-invariant, always dark) — top navigation bar only.
     This layer is intentionally fixed and styled with --chrome-* CSS variables.
     It does NOT read light/dark canvas tokens by design. */
  return (
    <>
      <header
        className="sticky top-0 z-50 w-full"
        style={{
          background: 'var(--chrome-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 md:px-6">

          {/* Left — Logo + Nav */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            <button
              onClick={() => router.push(showNav ? '/dashboard' : '/my-department')}
              className="flex items-center gap-2.5 group"
            >
              {/* DTCE Logo badge */}
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

            {/* Active Department Label */}
            <div className="h-4 w-px bg-slate-800 hidden sm:block" />
            <div className="text-[11px] font-bold text-amber-400 tracking-wider uppercase bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full select-none max-w-[150px] md:max-w-none truncate">
              {activeDeptName}
            </div>

            {/* Desktop Nav */}
            {showNav && (
              <nav className="hidden md:flex items-center gap-1">
                {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                  if (role === 'national_coordinator' && (label === 'Team' || label === 'Settings')) return null;
                  const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
                  return (
                    <button
                      key={href}
                      onClick={() => router.push(href)}
                      className="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200"
                      style={{
                        color:      active ? 'var(--chrome-text)' : 'var(--chrome-text-muted)',
                        background: active ? 'var(--chrome-surface)' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--chrome-text)'
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--chrome-text-muted)'
                      }}
                    >
                      <Icon size={13} />
                      {label}
                      {active && (
                        <span
                          className="absolute bottom-0 left-3 right-3 h-px rounded-full"
                          style={{ background: 'linear-gradient(90deg, transparent, var(--chrome-accent), transparent)' }}
                        />
                      )}
                    </button>
                  )
                })}
              </nav>
            )}
          </div>

          {/* Right — Theme toggle + Role badge + User + Sign out */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <ThemeToggle compact />

            {/* Role badge */}
            <span className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize tracking-wide ${ROLE_COLORS[role] || ROLE_COLORS.assistant}`}>
              {role === 'assistant' && hasNoDepartment ? 'Coord. Assistant' : (ROLE_LABELS[role] || role)}
            </span>

            {/* User avatar */}
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}
              >
                {initials || '?'}
              </div>
              <span className="hidden lg:block text-[12px] font-medium" style={{ color: 'var(--chrome-text-muted)' }}>
                {name.split(' ')[0]}
              </span>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={signing}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all duration-200"
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
              <span className="hidden sm:block">{signing ? 'Signing out…' : 'Sign out'}</span>
            </button>

            {/* Mobile hamburger */}
            {showNav && (
              <button
                className="flex md:hidden items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:text-white"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={() => setOpen(o => !o)}
              >
                {open ? <X size={15} /> : <Menu size={15} />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav drawer */}
        {showNav && open && (
          <div
            className="border-t md:hidden"
            style={{
              background:   'rgba(6,9,15,0.98)',
              borderColor:  'rgba(255,255,255,0.07)',
            }}
          >
            <nav className="flex flex-col gap-1 p-3">
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                if (role === 'national_coordinator' && (label === 'Team' || label === 'Settings')) return null;
                const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
                return (
                  <button
                    key={href}
                    onClick={() => { router.push(href); setOpen(false) }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors"
                    style={{
                      color:      active ? '#F1F5F9' : '#64748B',
                      background: active ? 'rgba(59,130,246,0.08)' : 'transparent',
                    }}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                )
              })}
            </nav>
          </div>
        )}
      </header>
    </>
  )
}
