import { DtceWorkspaceLoader } from '@/components/ui/dtce-workspace-loader'

export default function DashboardLoading() {
  return (
    <DtceWorkspaceLoader
      title="Executive Desk"
      steps={[
        'Loading event telemetry…',
        'Fetching department reports…',
        'Preparing overview…',
      ]}
    />
  )
}
