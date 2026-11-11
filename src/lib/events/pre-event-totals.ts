/**
 * Pre-event online registration totals are mirrored onto the Registration
 * department's `default_metrics_schema` (so every device sees the same values).
 * That JSON is not event-scoped, so it carries the event it belongs to in
 * `pre_event_online_totals_event_id`. Values stamped for another event must
 * not be shown for the current one.
 */
export type PreEventTotals = Record<string, number>

export function preEventTotalsFromDepartmentSchema(
  schema: any,
  currentEventId: string | null | undefined
): PreEventTotals | null {
  const totals = schema?.pre_event_online_totals
  if (!totals || typeof totals !== 'object') return null
  const stampedFor = schema?.pre_event_online_totals_event_id
  // Unstamped values pre-date multi-event support; the migration stamps them
  // with the event that was current at the time.
  if (stampedFor && currentEventId && stampedFor !== currentEventId) return null
  return totals as PreEventTotals
}
