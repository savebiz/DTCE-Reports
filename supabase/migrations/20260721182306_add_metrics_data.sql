-- Migration: Add metrics_data column to daily_reports table
-- Run this in your Supabase SQL Editor to resolve schema cache errors during daily report submissions.

alter table public.daily_reports 
add column if not exists metrics_data jsonb default '{}'::jsonb not null;

alter table public.daily_reports 
add column if not exists submitted_on_behalf_by uuid references public.profiles(id) on delete set null;

alter table public.department_narratives 
add column if not exists submitted_on_behalf_by uuid references public.profiles(id) on delete set null;
