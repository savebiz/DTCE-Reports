-- Migration: Challenge Resolutions Workflow
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.challenge_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_key TEXT NOT NULL UNIQUE,
  resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'resolved')),
  resolution_note TEXT,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenge_resolutions_key ON public.challenge_resolutions(challenge_key);

-- Enable RLS
ALTER TABLE public.challenge_resolutions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow select challenge_resolutions" ON public.challenge_resolutions;
CREATE POLICY "Allow select challenge_resolutions" ON public.challenge_resolutions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert update challenge_resolutions" ON public.challenge_resolutions;
CREATE POLICY "Allow insert update challenge_resolutions" ON public.challenge_resolutions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'coordinator', 'national_coordinator', 'assistant', 'hod'))
  );
