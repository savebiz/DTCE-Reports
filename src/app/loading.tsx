import { DtceWorkspaceLoader } from '@/components/ui/dtce-workspace-loader'

export default function RootLoading() {
  return (
    <DtceWorkspaceLoader
      title="DTCE Reporting"
      steps={[
        'Preparing workspace…',
        'Verifying session…',
        'Loading event data…',
      ]}
    />
  )
}
