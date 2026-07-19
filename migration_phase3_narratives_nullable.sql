-- Migration: Phase 3 Narrative daily_report_id Nullable Fix
-- Run this block in the Supabase SQL Editor to remove the not-null constraint on daily_report_id in the department_narratives table, allowing end-of-event summaries to be created.

alter table public.department_narratives alter column daily_report_id drop not null;
