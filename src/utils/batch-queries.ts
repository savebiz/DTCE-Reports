/**
 * Batch Query Helpers to eliminate N+1 round-trip network queries in DTCE Reports
 */

export async function fetchEnhancedStoreRequests(supabase: any, reqsData: any[]) {
  if (!reqsData || reqsData.length === 0) return []

  const profileIds = Array.from(
    new Set(reqsData.map(r => r.requester_profile_id).filter(Boolean))
  )
  const departmentIds = Array.from(
    new Set(reqsData.map(r => r.department_id).filter(Boolean))
  )

  const [profilesRes, deptsRes] = await Promise.all([
    profileIds.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    departmentIds.length > 0
      ? supabase.from('departments').select('id, name').in('id', departmentIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]))
  const deptMap = new Map((deptsRes.data || []).map((d: any) => [d.id, d]))

  return reqsData.map((r: any) => ({
    ...r,
    requester: profileMap.get(r.requester_profile_id) || { full_name: 'Unknown HOD', email: '' },
    department: deptMap.get(r.department_id) || { name: 'Unknown Department' },
  }))
}
