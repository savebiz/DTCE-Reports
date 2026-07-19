-- Migration: Phase 3 Narrative Columns Fix
-- Run this block in the Supabase SQL Editor to add the missing event/prose/JSON columns to the department_narratives table in production.

-- 1. Add missing event_id column
alter table public.department_narratives 
add column if not exists event_id uuid references public.events(id) on delete cascade;

-- 2. Add missing department_id column
alter table public.department_narratives 
add column if not exists department_id uuid references public.departments(id) on delete cascade;

-- 3. Add missing is_end_of_event column
alter table public.department_narratives 
add column if not exists is_end_of_event boolean default false not null;

-- 4. Add missing status column
alter table public.department_narratives 
add column if not exists status text default 'draft'::text not null check (status in ('draft', 'submitted', 'reviewed', 'approved'));

-- 5. Add missing overview column
alter table public.department_narratives 
add column if not exists overview text;

-- 6. Add missing highlights column
alter table public.department_narratives 
add column if not exists highlights text;

-- 7. Add missing challenges_json column
alter table public.department_narratives 
add column if not exists challenges_json jsonb default '[]'::jsonb not null;

-- 8. Add missing recommendations_json column
alter table public.department_narratives 
add column if not exists recommendations_json jsonb default '[]'::jsonb not null;
