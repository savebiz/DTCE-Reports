-- Migration: Add Games, Arts & Crafts Department to Live Database (Supabase UUID format)
-- Run this in the Supabase SQL Editor.

INSERT INTO public.departments (id, name)
SELECT gen_random_uuid(), 'Games, Arts & Crafts'
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments WHERE LOWER(name) = LOWER('Games, Arts & Crafts')
);
