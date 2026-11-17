import { redirect } from 'next/navigation'
import { MarketListView } from '@/components/needs/market-list-view'
import { isMock } from '@/utils/supabase'
import { getAdminClient } from '@/utils/supabase/admin'
import { getCurrentEvent, isPreEventNeedsEnabled } from '@/lib/events/current-event'

export const dynamic = 'force-dynamic'

export default async function DashboardMarketListPage() {
  if (!isMock) {
    const event = await getCurrentEvent(getAdminClient())
    if (!isPreEventNeedsEnabled(event)) {
      redirect('/dashboard')
    }
  }
  return <MarketListView backHref="/dashboard" />
}
