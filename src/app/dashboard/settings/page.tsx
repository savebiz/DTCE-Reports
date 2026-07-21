'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LookupItem {
  id: string
  name: string
  created_at: string
}

function SettingsContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'tribes' | 'diagnoses'>('tribes')

  // Data lists
  const [tribes, setTribes] = useState<LookupItem[]>([])
  const [diagnoses, setDiagnoses] = useState<LookupItem[]>([])

  // Insertion Inputs
  const [newTribe, setNewTribe] = useState('')
  const [newDiagnosis, setNewDiagnosis] = useState('')

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

    if (prof && prof.role !== 'super_admin' && prof.role !== 'coordinator') {
      router.push('/dashboard')
      return
    }
    setProfile(prof)

    if (!isMock) {
      // Fetch tribes
      const { data: tribesData } = await supabase
        .from('tribes')
        .select('*')
        .order('name', { ascending: true })
      setTribes(tribesData || [])

      // Fetch diagnoses
      const { data: diagnosesData } = await supabase
        .from('diagnoses')
        .select('*')
        .order('name', { ascending: true })
      setDiagnoses(diagnosesData || [])
    } else {
      // Mock Lookups
      setTribes([
        { id: 't-1', name: 'Reuben', created_at: '' },
        { id: 't-2', name: 'Simeon', created_at: '' },
        { id: 't-3', name: 'Judah', created_at: '' }
      ])
      setDiagnoses([
        { id: 'd-1', name: 'FEVER', created_at: '' },
        { id: 'd-2', name: 'RTI', created_at: '' },
        { id: 'd-3', name: 'DIARRHOEA', created_at: '' }
      ])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Oversight Lookup Lists Configuration</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modify tribe names and medical diagnosis options shown in HOD report forms.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex gap-2 border-b border-border pb-px">
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
        </div>

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
