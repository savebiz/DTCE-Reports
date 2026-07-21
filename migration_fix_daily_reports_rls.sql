-- Migration: Fix RLS Policies for daily_reports and department_narratives
-- Run this in the Supabase SQL Editor to resolve "new row violates row-level security policy" errors when submitting daily reports or narratives.

-- 1. Enable RLS on daily_reports
alter table public.daily_reports enable row level security;

-- Drop all existing daily_reports policies to ensure clean state
drop policy if exists "Allow admins/coordinators to view all reports" on public.daily_reports;
drop policy if exists "Allow HODs/assistants to view their assigned department reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants to insert reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants/admins to insert reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants to update their draft reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants/admins to update reports" on public.daily_reports;
drop policy if exists "Allow select daily_reports" on public.daily_reports;
drop policy if exists "Allow insert daily_reports" on public.daily_reports;
drop policy if exists "Allow update daily_reports" on public.daily_reports;

-- Create comprehensive SELECT policy for daily_reports
create policy "Allow select daily_reports" on public.daily_reports 
for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = daily_reports.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = daily_reports.department_id)
);

-- Create comprehensive INSERT policy for daily_reports
create policy "Allow insert daily_reports" on public.daily_reports 
for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod', 'assistant'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = daily_reports.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = daily_reports.department_id)
);

-- Create comprehensive UPDATE policy for daily_reports
create policy "Allow update daily_reports" on public.daily_reports 
for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod', 'assistant'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = daily_reports.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = daily_reports.department_id)
);

-- 2. Enable RLS on department_narratives
alter table public.department_narratives enable row level security;

drop policy if exists "Allow narrative modification based on report write access" on public.department_narratives;
drop policy if exists "Allow narrative modification based on department access" on public.department_narratives;
drop policy if exists "Allow read access based on report access" on public.department_narratives;
drop policy if exists "Allow select department_narratives" on public.department_narratives;
drop policy if exists "Allow all department_narratives" on public.department_narratives;

create policy "Allow select department_narratives" on public.department_narratives 
for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = department_narratives.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = department_narratives.department_id)
);

create policy "Allow all department_narratives" on public.department_narratives 
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod', 'assistant'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = department_narratives.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = department_narratives.department_id)
);
