-- Migration: National Coordinator Role & Enhanced Store Requisition Workflow
-- Run this in the Supabase SQL Editor.

-- 1. Add 'national_coordinator' to the profiles role CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'coordinator', 'national_coordinator', 'hod', 'assistant'));

-- 2. Update store_requests status CHECK to include new stages
ALTER TABLE public.store_requests DROP CONSTRAINT IF EXISTS store_requests_status_check;
ALTER TABLE public.store_requests ADD CONSTRAINT store_requests_status_check 
  CHECK (status IN ('pending_coordinator', 'approved', 'declined', 'in_progress', 'partially_fulfilled', 'delivered'));

-- 3. Add RLS policies for national_coordinator on store_requests
-- SELECT: national_coordinator can see all store requests
DROP POLICY IF EXISTS "national_coordinator_select_store_requests" ON public.store_requests;
CREATE POLICY "national_coordinator_select_store_requests" ON public.store_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

-- UPDATE: national_coordinator can approve/decline/delegate store requests
DROP POLICY IF EXISTS "national_coordinator_update_store_requests" ON public.store_requests;
CREATE POLICY "national_coordinator_update_store_requests" ON public.store_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

-- 4. Grant national_coordinator SELECT on all oversight tables
DROP POLICY IF EXISTS "national_coordinator_select_daily_reports" ON public.daily_reports;
CREATE POLICY "national_coordinator_select_daily_reports" ON public.daily_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

DROP POLICY IF EXISTS "national_coordinator_select_department_narratives" ON public.department_narratives;
CREATE POLICY "national_coordinator_select_department_narratives" ON public.department_narratives FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

DROP POLICY IF EXISTS "national_coordinator_select_departments" ON public.departments;
CREATE POLICY "national_coordinator_select_departments" ON public.departments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

DROP POLICY IF EXISTS "national_coordinator_select_profiles" ON public.profiles;
CREATE POLICY "national_coordinator_select_profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

DROP POLICY IF EXISTS "national_coordinator_select_event_days" ON public.event_days;
CREATE POLICY "national_coordinator_select_event_days" ON public.event_days FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);

DROP POLICY IF EXISTS "national_coordinator_select_events" ON public.events;
CREATE POLICY "national_coordinator_select_events" ON public.events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'national_coordinator')
);
