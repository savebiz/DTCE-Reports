-- Migration: Registration Two-Channel Schema + Pre-Event Online Totals
-- Run this in the Supabase SQL Editor

-- 1. Create Pre-Event Online Registration Totals Table
CREATE TABLE IF NOT EXISTS public.registration_pre_event_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL CHECK (category IN ('teachers', 'teens', 'pre_teens', 'children')),
  total_online_registered integer NOT NULL DEFAULT 0,
  entered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_event_category UNIQUE (event_id, category)
);

-- Enable RLS
ALTER TABLE public.registration_pre_event_totals ENABLE ROW LEVEL SECURITY;

-- Policies for pre-event totals
DROP POLICY IF EXISTS "Allow select pre-event totals for authenticated users" ON public.registration_pre_event_totals;
CREATE POLICY "Allow select pre-event totals for authenticated users" ON public.registration_pre_event_totals
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow modification of pre-event totals" ON public.registration_pre_event_totals;
CREATE POLICY "Allow modification of pre-event totals" ON public.registration_pre_event_totals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'national_coordinator', 'coordinator')
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      LEFT JOIN public.hod_assignments ha ON ha.profile_id = p.id
      LEFT JOIN public.departments d ON d.id = COALESCE(ha.department_id, p.department_id)
      WHERE p.id = auth.uid() AND LOWER(d.name) LIKE '%registration%'
    )
  );

-- 2. Update Registration Department Schema in departments table
UPDATE public.departments
SET default_metrics_schema = '{
  "fields": [
    {
      "name": "online_manual_pickups",
      "type": "repeat-group",
      "label": "SECTION A — Online Manual Pickup (Today)",
      "schema": [
        {
          "name": "category",
          "type": "select",
          "label": "Category",
          "options": ["Teachers", "Teens", "Pre-teens", "Children"],
          "required": true
        },
        {
          "name": "count_picked_up_today",
          "type": "number",
          "label": "Manuals Picked Up Today",
          "required": true
        }
      ]
    },
    {
      "name": "walkin_registrations",
      "type": "repeat-group",
      "label": "SECTION B — Offline / Walk-in Registration (Today)",
      "schema": [
        {
          "name": "category",
          "type": "select",
          "label": "Category",
          "options": ["Teachers", "Teens", "Pre-teens", "Children"],
          "required": true
        },
        {
          "name": "new_registrations",
          "type": "number",
          "label": "New Registrations Today",
          "required": true
        },
        {
          "name": "manuals_distributed",
          "type": "number",
          "label": "Manuals Distributed Today",
          "required": true
        },
        {
          "name": "amount_collected",
          "type": "number",
          "label": "Amount Collected (₦)",
          "required": true
        }
      ]
    }
  ]
}'::jsonb
WHERE LOWER(name) LIKE '%registration%';
