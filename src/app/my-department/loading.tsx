import { DtceWorkspaceLoader } from '@/components/ui/dtce-workspace-loader'

export default function MyDepartmentLoading() {
  return (
    <DtceWorkspaceLoader
      title="Department Portal"
      steps={[
        'Verifying department roster…',
        'Loading event schedule…',
        'Preparing workspace…',
      ]}
    />
  )
}
