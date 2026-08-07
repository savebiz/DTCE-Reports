-- Migration: Add Secondary School Outreach Department to Live Database (Supabase UUID format)
-- Run this in the Supabase SQL Editor.

INSERT INTO public.departments (id, name)
SELECT gen_random_uuid(), 'Secondary School Outreach'
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments WHERE LOWER(name) = LOWER('Secondary School Outreach')
);
