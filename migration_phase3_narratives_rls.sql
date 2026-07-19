-- Migration: Phase 3 Narrative RLS Policy Fix
-- Run this block in the Supabase SQL Editor to update RLS policies, allowing HODs and assistants to create and edit end-of-event reports.

drop policy if exists "Allow narrative modification based on report write access" on public.department_narratives;
drop policy if exists "Allow narrative modification based on department access" on public.department_narratives;

create policy "Allow narrative modification based on department access" 
on public.department_narratives 
for all 
using (
  -- 1. Super Admins and Coordinators can modify all narratives
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin', 'coordinator')
  ) or
  -- 2. End-of-event reports can be modified by HODs/assistants assigned to the department
  (is_end_of_event = true and exists (
    select 1 from public.hod_assignments
    where profile_id = auth.uid() and department_id = department_narratives.department_id and event_id = department_narratives.event_id
  )) or
  -- 3. Daily report narratives can be modified by their authors or assigned HODs/assistants
  (is_end_of_event = false and exists (
    select 1 from public.daily_reports
    where id = daily_report_id and (
      submitted_by = auth.uid() or
      exists (
        select 1 from public.hod_assignments
        where profile_id = auth.uid() and department_id = daily_reports.department_id and event_id = daily_reports.event_id
      )
    )
  ))
);
