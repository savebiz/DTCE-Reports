'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function UnassignedDepartmentGate({ showHomeButton = true }: { showHomeButton?: boolean }) {
  const router = useRouter()
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--background)' }}>
      <div className="max-w-md w-full rounded-2xl border border-border bg-card/50 p-6 space-y-4 text-center shadow-sm">
        <h1 className="text-xl font-bold text-foreground">You are not assigned to a department</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your account is not on a department team for the current event. If you think this is a mistake, please contact the Secretariat.
        </p>
        {showHomeButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/my-department')}
            className="text-xs h-9 cursor-pointer"
          >
            ← Back to Department Home
          </Button>
        )}
      </div>
    </div>
  )
}
