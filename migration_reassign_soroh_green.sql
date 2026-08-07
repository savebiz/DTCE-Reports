-- Migration: Reassign Soroh Green (ee99b681-7006-4c14-86ed-cea9a917f333) to Secondary School Outreach
-- Run this query in the Supabase SQL Editor.

-- 1. Ensure Secondary School Outreach department exists
INSERT INTO public.departments (id, name)
SELECT gen_random_uuid(), 'Secondary School Outreach'
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments WHERE LOWER(name) = LOWER('Secondary School Outreach')
);

-- 2. Deactivate previous hod_assignments for Soroh Green
UPDATE public.hod_assignments
SET is_active = false
WHERE profile_id = 'ee99b681-7006-4c14-86ed-cea9a917f333';

-- 3. Create active HOD assignment for Secondary School Outreach
INSERT INTO public.hod_assignments (profile_id, department_id, is_active)
SELECT 
  'ee99b681-7006-4c14-86ed-cea9a917f333',
  id,
  true
FROM public.departments 
WHERE LOWER(name) = LOWER('Secondary School Outreach')
LIMIT 1;
