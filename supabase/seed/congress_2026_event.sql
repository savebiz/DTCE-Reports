-- =============================================================================
-- Congress 2026: create the event and make it the platform's current event.
-- Run in the Supabase SQL Editor AFTER both migrations
--   20261111120000_multi_event_foundation.sql
--   20261112090000_pre_event_needs.sql
-- Safe to re-run (it will not create a second Congress 2026).
--
-- What it does
--   1. Creates "Congress 2026" (7-12 Dec 2026) with status 'requisition_open'
--      so HODs can send their needs lists now.
--   2. Creates its six event days.
--   3. Copies every HOD / assistant assignment from the most recent earlier
--      event, so the same people land in the same departments. Roster changes
--      are then made on the Team page (or see supabase/seed/README.md).
--   4. Makes Congress the current event.
--
-- After this runs, the dashboard and reports show Congress. Convention 2026
-- data is kept and can still be exported with ?eventId=<convention id>.
-- =============================================================================

BEGIN;

INSERT INTO public.events (name, start_date, end_date, event_type, event_year, status)
SELECT 'Congress 2026', DATE '2026-12-07', DATE '2026-12-12', 'congress', 2026, 'requisition_open'
WHERE NOT EXISTS (
  SELECT 1 FROM public.events WHERE event_type = 'congress' AND event_year = 2026
);

-- Six days: 7th .. 12th December
INSERT INTO public.event_days (event_id, day_number, date)
SELECT e.id, d.n, DATE '2026-12-07' + (d.n - 1)
FROM public.events e
CROSS JOIN generate_series(1, 6) AS d(n)
WHERE e.event_type = 'congress' AND e.event_year = 2026
ON CONFLICT DO NOTHING;

-- Carry the existing teams over from the most recent earlier event
INSERT INTO public.hod_assignments (event_id, profile_id, department_id, role_in_event)
SELECT cong.id, ha.profile_id, ha.department_id, ha.role_in_event
FROM public.events cong
JOIN LATERAL (
  SELECT id FROM public.events
  WHERE id <> cong.id AND start_date < cong.start_date
  ORDER BY start_date DESC
  LIMIT 1
) prev ON true
JOIN public.hod_assignments ha ON ha.event_id = prev.id
WHERE cong.event_type = 'congress' AND cong.event_year = 2026
ON CONFLICT (event_id, profile_id, department_id) DO NOTHING;

SELECT public.set_current_event(id)
FROM public.events
WHERE event_type = 'congress' AND event_year = 2026;

COMMIT;

-- Check: exactly one current event, and it is Congress 2026
-- SELECT name, status, is_current FROM public.events ORDER BY start_date;
-- SELECT count(*) AS carried_over_assignments FROM public.hod_assignments
--   WHERE event_id = (SELECT id FROM public.events WHERE is_current);
