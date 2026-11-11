-- =============================================================================
-- Phase 0: Multi-event foundation + access hardening
-- =============================================================================
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Safe to re-run: every step is "IF NOT EXISTS" / "CREATE OR REPLACE" / guarded.
-- Additive only: no rows are deleted and no existing data values are changed,
-- except the new lifecycle columns being filled in for existing events.
--
-- What it does
--   1. Adds lifecycle columns to events (type, year, status, is_current, ...).
--   2. Marks exactly one event as the "current" event (the one with the most
--      daily reports, i.e. the 2026 Convention) and closes past events.
--   3. Adds set_current_event() so a Super Admin can switch to Congress later.
--   4. Fills any assignment / requisition rows that are missing an event.
--   5. Replaces the hard-coded Stores department UUID in store_requests
--      policies with an is_stores_staff() check.
--   6. Stops users from changing their own role / active flag / username
--      through the public API (privilege escalation fix).
--   7. Makes new sign-ups start as 'assistant' regardless of metadata; the
--      provisioning APIs already set the real role with the service key.
--   8. Adds indexes for event-scoped queries.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Event lifecycle columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_year integer;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS requisition_opens_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS requisition_closes_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.events
SET event_type = CASE
    WHEN name ILIKE '%congress%'   THEN 'congress'
    WHEN name ILIKE '%convention%' THEN 'convention'
    ELSE 'other'
  END
WHERE event_type IS NULL OR event_type NOT IN ('convention', 'congress', 'other');

UPDATE public.events
SET event_year = EXTRACT(YEAR FROM COALESCE(start_date, created_at::date))::int
WHERE event_year IS NULL;

-- Past events become 'closed'; anything still ahead stays in 'planning'.
-- Existing valid statuses (e.g. 'closed' set by the close-event API) are kept.
UPDATE public.events
SET status = CASE
    WHEN end_date IS NOT NULL AND end_date < CURRENT_DATE THEN 'closed'
    ELSE 'planning'
  END
WHERE status IS NULL
   OR status NOT IN ('planning', 'requisition_open', 'live', 'closed', 'archived');

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('convention', 'congress', 'other'));
ALTER TABLE public.events ALTER COLUMN event_type SET DEFAULT 'other';
ALTER TABLE public.events ALTER COLUMN event_type SET NOT NULL;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('planning', 'requisition_open', 'live', 'closed', 'archived'));
ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'planning';
ALTER TABLE public.events ALTER COLUMN status SET NOT NULL;

-- At most one current event at any time.
CREATE UNIQUE INDEX IF NOT EXISTS events_single_current_idx
  ON public.events ((is_current)) WHERE is_current;

-- If no event is flagged yet, flag the one that actually holds the data.
UPDATE public.events
SET is_current = true
WHERE id = (
    SELECT e.id
    FROM public.events e
    LEFT JOIN public.daily_reports d ON d.event_id = e.id
    GROUP BY e.id, e.start_date, e.created_at
    ORDER BY COUNT(d.id) DESC, e.start_date DESC NULLS LAST, e.created_at DESC
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM public.events WHERE is_current);

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_event_updated ON public.events;
CREATE TRIGGER on_event_updated
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.handle_update_timestamp();

-- -----------------------------------------------------------------------------
-- 2. Switch the current event (Super Admin only)
--    Usage: select public.set_current_event('<event uuid>');
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_current_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow the SQL editor / service key; otherwise require a Super Admin.
  IF COALESCE(auth.jwt() ->> 'role', '') IN ('authenticated', 'anon')
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Only a Super Admin can change the current event.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Event % not found.', p_event_id;
  END IF;

  UPDATE events SET is_current = false WHERE is_current AND id <> p_event_id;
  UPDATE events SET is_current = true  WHERE id = p_event_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Rows written without an event (older code paths) -> current event
--    (No-op where the column is already NOT NULL.)
-- -----------------------------------------------------------------------------
UPDATE public.hod_assignments
SET event_id = (SELECT id FROM public.events WHERE is_current LIMIT 1)
WHERE event_id IS NULL;

UPDATE public.store_requests
SET event_id = (SELECT id FROM public.events WHERE is_current LIMIT 1)
WHERE event_id IS NULL;

-- Pre-event registration totals mirrored on the Registration department are
-- not event-scoped; stamp the existing values with the current event so they
-- are not shown for the next event.
UPDATE public.departments
SET default_metrics_schema = default_metrics_schema
    || jsonb_build_object('pre_event_online_totals_event_id', (SELECT id FROM public.events WHERE is_current LIMIT 1))
WHERE name ILIKE '%registration%'
  AND default_metrics_schema ? 'pre_event_online_totals'
  AND NOT default_metrics_schema ? 'pre_event_online_totals_event_id';

-- -----------------------------------------------------------------------------
-- 4. Stores staff check (replaces hard-coded department UUID in policies)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_stores_staff(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1
           FROM hod_assignments ha
           JOIN departments d ON d.id = ha.department_id
           WHERE ha.profile_id = p_uid
             AND d.name ILIKE '%store%'
         )
      OR EXISTS (
           SELECT 1 FROM profiles p
           WHERE p.id = p_uid AND p.role = 'hod' AND p.username = 'stores.hod'
         );
$$;

DROP POLICY IF EXISTS "Allow select access to store requests" ON public.store_requests;
CREATE POLICY "Allow select access to store requests" ON public.store_requests
FOR SELECT USING (
  requester_profile_id = auth.uid()
  OR assigned_approver_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'coordinator', 'national_coordinator'))
  OR public.is_stores_staff()
);

DROP POLICY IF EXISTS "Allow modification of store requests" ON public.store_requests;
CREATE POLICY "Allow modification of store requests" ON public.store_requests
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'coordinator', 'national_coordinator'))
  OR assigned_approver_id = auth.uid()
  OR (status IN ('approved', 'in_progress', 'partially_fulfilled', 'ready_for_collection') AND public.is_stores_staff())
);

-- -----------------------------------------------------------------------------
-- 5. Privilege-escalation fix: users may update their own profile row (e.g.
--    must_change_password), but NOT their role, active flag, email or username.
--    Server APIs (service key) and the SQL editor are unaffected.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.role      IS DISTINCT FROM OLD.role
  OR NEW.is_active IS DISTINCT FROM OLD.is_active
  OR NEW.email     IS DISTINCT FROM OLD.email
  OR NEW.username  IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'Only administrators can change role, status, email or username.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_privileged_columns();

-- -----------------------------------------------------------------------------
-- 6. New auth users start with the lowest role. user_metadata is editable by
--    the user, so it must never decide a role. Provisioning APIs upsert the
--    real role straight after creating the account.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, username, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'assistant',
    COALESCE(NEW.raw_user_meta_data->>'username', substring(NEW.email from '^[^@]+')),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------------------------------
-- 7. Indexes for event-scoped queries
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_reports_event_id      ON public.daily_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_store_requests_event_id     ON public.store_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_hod_assignments_event_id    ON public.hod_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_days_event_id         ON public.event_days(event_id);
CREATE INDEX IF NOT EXISTS idx_department_narratives_event ON public.department_narratives(event_id);

COMMIT;

-- -----------------------------------------------------------------------------
-- Check the result:
--   select id, name, event_type, event_year, status, is_current from public.events order by start_date;
-- -----------------------------------------------------------------------------
