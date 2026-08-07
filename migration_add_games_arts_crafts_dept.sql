-- Migration: Add Games, Arts & Crafts Department to Live Database
-- Run this in the Supabase SQL Editor.

INSERT INTO public.departments (id, name)
VALUES ('dept-42', 'Games, Arts & Crafts')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
