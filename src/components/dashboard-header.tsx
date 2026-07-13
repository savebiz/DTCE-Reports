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

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center space-x-4">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          DTCE Reporting Portal
        </span>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
          {role.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-center space-x-4">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Hi, <span className="font-semibold text-slate-800 dark:text-slate-200">{name}</span>
        </span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign Out
        </Button>
      </div>
    </header>
  )
}
