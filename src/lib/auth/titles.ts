/**
 * The General Secretary's account uses the `national_coordinator` role, so it
 * has exactly the National Coordinator's access (dashboard, approving store
 * requests and needs lists). Only the titles on screen differ. The account is
 * recognised by its name or username, e.g. "General Secretary" / "gen.sec".
 */
export function isGeneralSecretary(p?: { full_name?: string | null; username?: string | null } | null): boolean {
  const s = `${p?.full_name || ''} ${p?.username || ''}`.toLowerCase()
  return /general\s*secretary|\bgen\.?\s*sec\b|gensec/.test(s)
}
