'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getClient } from '@/utils/supabase'
import { LayoutGrid, FileText, BarChart2, Users, LogOut, Menu, X, Shield } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview',    href: '/dashboard',         icon: LayoutGrid },
  { label: 'Reports',     href: '/dashboard/reports', icon: FileText   },
  { label: 'YoY Analytics', href: '/dashboard/yoy',  icon: BarChart2  },
  { label: 'Team',        href: '/dashboard/team',    icon: Users      },
]

const ROLE_LABELS: Record<string, string> = {
  super_admin:  'Admin',
  coordinator:  'Coordinator',
  hod:          'HOD',
  assistant:    'Assistant',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  coordinator:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  hod:          'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  assistant:    'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

export function DashboardHeader() {
  const router   = useRouter()
  const pathname = usePathname()
  const [user, setUser]     = useState<any>(null)
  const [open, setOpen]     = useState(false)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = getClient()
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    }
    fetchUser()
  }, [])

  const handleSignOut = async () => {
    setSigning(true)
    const supabase = getClient()
    await supabase.auth.signOut()
    // Clear mock cookie
    document.cookie = 'sb-mock-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/login'
  }

  if (!user) return null

  const name    = user.user_metadata?.full_name || user.email || ''
  const role    = user.user_metadata?.role || 'assistant'
  const showNav = role === 'super_admin' || role === 'coordinator'

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  return (
    <>
      <header
        className="sticky top-0 z-50 w-full"
        style={{
          background: 'rgba(6, 9, 15, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 md:px-6">

          {/* Left — Logo + Nav */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2.5 group"
            >
              <div className="relative flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}>
                <Shield size={14} className="text-white" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 pulse-dot border-2 border-[#06090F]" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[13px] font-bold tracking-tight text-white">DTCE</span>
                <span className="text-[9px] font-medium tracking-widest text-slate-500 uppercase">Reporting</span>
              </div>
            </button>

            {/* Desktop Nav */}
            {showNav && (
              <nav className="hidden md:flex items-center gap-1">
                {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                  const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
                  return (
                    <button
                      key={href}
                      onClick={() => router.push(href)}
                      className="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200"
                      style={{
                        color:      active ? '#F1F5F9' : '#64748B',
                        background: active ? 'rgba(59,130,246,0.08)' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.color = '#94A3B8'
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.color = '#64748B'
                      }}
                    >
                      <Icon size={13} />
                      {label}
                      {active && (
                        <span
                          className="absolute bottom-0 left-3 right-3 h-px rounded-full"
                          style={{ background: 'linear-gradient(90deg, transparent, #3B82F6, transparent)' }}
                        />
                      )}
                    </button>
                  )
                })}
              </nav>
            )}
          </div>

          {/* Right — Role badge + User + Sign out */}
          <div className="flex items-center gap-3">
            {/* Role badge */}
            <span className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize tracking-wide ${ROLE_COLORS[role] || ROLE_COLORS.assistant}`}>
              {ROLE_LABELS[role] || role}
            </span>

            {/* User avatar */}
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}
              >
                {initials || '?'}
              </div>
              <span className="hidden lg:block text-[12px] font-medium text-slate-400">
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
                color:        '#64748B',
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
                el.style.color = '#64748B'
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
