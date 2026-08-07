-- Migration: End-of-Convention Feedback Modal Table & Permanent Gate Column
-- Run this in the Supabase SQL Editor.

-- 1. Add feedback_submitted_at nullable timestamp column to profiles
-- This is the permanent gate — non-null means never show the modal to this user again.
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create platform_feedback table
CREATE TABLE IF NOT EXISTS public.platform_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  overall_satisfaction INT NOT NULL CHECK (overall_satisfaction BETWEEN 1 AND 5),
  daily_report_ease INT NOT NULL CHECK (daily_report_ease BETWEEN 1 AND 5),
  requisition_ease INT NOT NULL CHECK (requisition_ease BETWEEN 1 AND 5),
  vs_paper_process TEXT NOT NULL CHECK (vs_paper_process IN ('much_harder', 'harder', 'about_the_same', 'easier', 'much_easier')),
  encountered_bugs BOOLEAN NOT NULL DEFAULT FALSE,
  bugs_description TEXT,
  mobile_experience_rating INT CHECK (mobile_experience_rating BETWEEN 1 AND 5),
  nps_score INT NOT NULL CHECK (nps_score BETWEEN 0 AND 10),
  top_improvement TEXT NOT NULL,
  additional_comments TEXT
);

-- 3. Enable RLS on platform_feedback
ALTER TABLE public.platform_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert their own feedback
DROP POLICY IF EXISTS "Authenticated users can insert own feedback" ON public.platform_feedback;
CREATE POLICY "Authenticated users can insert own feedback" ON public.platform_feedback
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Policy: Users can view their own feedback, Admins/Coordinators can view all feedback
DROP POLICY IF EXISTS "Admins and Coordinators can view platform feedback" ON public.platform_feedback;
CREATE POLICY "Admins and Coordinators can view platform feedback" ON public.platform_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'coordinator', 'national_coordinator')
    ) OR auth.uid() = profile_id
  );
