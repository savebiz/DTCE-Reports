-- Migration: Phase 3 Schema Improvements
-- Run this in the Supabase SQL Editor to support the reporting split, Super Admin on-behalf auditing, and assistant signup domain policies.

-- 1. Add submitted_on_behalf_by column to daily_reports and department_narratives
alter table public.daily_reports 
add column if not exists submitted_on_behalf_by uuid references public.profiles(id) on delete set null;

alter table public.department_narratives 
add column if not exists submitted_on_behalf_by uuid references public.profiles(id) on delete set null;

-- 2. Update Row Level Security (RLS) policies for daily_reports
-- Drop HOD edit policies to recreate them with Super Admin privileges
drop policy if exists "Allow assigned HODs/assistants to insert reports" on public.daily_reports;
create policy "Allow assigned HODs/assistants/admins to insert reports" on public.daily_reports 
for insert with check (
  exists (
    select 1 from public.hod_assignments
    where profile_id = auth.uid() and department_id = daily_reports.department_id and event_id = daily_reports.event_id
  ) or exists (
    select 1 from public.profiles 
    where id = auth.uid() and role in ('super_admin', 'coordinator')
  )
);

drop policy if exists "Allow assigned HODs/assistants to update their draft reports" on public.daily_reports;
create policy "Allow assigned HODs/assistants/admins to update reports" on public.daily_reports 
for update using (
  exists (
    select 1 from public.hod_assignments
    where profile_id = auth.uid() and department_id = daily_reports.department_id and event_id = daily_reports.event_id
  ) or exists (
    select 1 from public.profiles 
    where id = auth.uid() and role in ('super_admin', 'coordinator')
  )
);

-- 3. Update Row Level Security (RLS) policies for department_narratives
drop policy if exists "Allow narrative modification based on report write access" on public.department_narratives;
create policy "Allow narrative modification based on report write access" on public.department_narratives 
for all using (
  exists (
    select 1 from public.daily_reports
    where id = daily_report_id and (
      submitted_by = auth.uid() or
      exists (
        select 1 from public.hod_assignments
        where profile_id = auth.uid() and department_id = daily_reports.department_id and event_id = daily_reports.event_id
      ) or exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('super_admin', 'coordinator')
      )
    )
  ) or exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin', 'coordinator')
  )
);
