'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/utils/supabase'
import { Button } from '@/components/ui/button'

export function DashboardHeader() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = getClient()
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    }
    fetchUser()
  }, [])

  const handleSignOut = async () => {
    const supabase = getClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!user) return null

  const name = user.user_metadata?.full_name || user.email
  const role = user.user_metadata?.role || 'assistant'
  const showNav = role === 'super_admin' || role === 'coordinator'

  return (
    <header className="flex h-14 items-center justify-between border-b border-hairline bg-white px-6">
      <div className="flex items-center space-x-6">
        <span 
          className="text-sm font-display font-bold text-ink-navy flex items-center space-x-1.5 cursor-pointer" 
          onClick={() => router.push('/')}
        >
          <span>⛪</span>
          <span>DTCE Reporting</span>
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 capitalize border border-hairline">
          {role.replace('_', ' ')}
        </span>
        {showNav && (
          <nav className="hidden md:flex space-x-4 text-xs font-semibold text-slate-500">
            <button onClick={() => router.push('/dashboard')} className="hover:text-ink-navy transition-colors">Grid Oversight</button>
            <button onClick={() => router.push('/dashboard/reports')} className="hover:text-ink-navy transition-colors">Export Pipeline</button>
            <button onClick={() => router.push('/dashboard/yoy')} className="hover:text-ink-navy transition-colors">YoY Analytics</button>
            <button onClick={() => router.push('/dashboard/team')} className="hover:text-ink-navy transition-colors">Provisioning</button>
          </nav>
        )}
      </div>

      <div className="flex items-center space-x-4">
        <span className="text-xs text-slate-500">
          Hi, <span className="font-semibold text-slate-800">{name}</span>
        </span>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="h-8 text-xs font-semibold border-hairline text-slate-700">
          Sign Out
        </Button>
      </div>
    </header>
  )
}
