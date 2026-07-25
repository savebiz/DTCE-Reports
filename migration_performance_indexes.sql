-- Migration: Performance Indexes for DTCE Reports
-- Run in Supabase SQL Editor to optimize query execution plans

-- Store Requisitions Indexes
CREATE INDEX IF NOT EXISTS idx_store_requests_department_id ON public.store_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_store_requests_requester_profile_id ON public.store_requests(requester_profile_id);
CREATE INDEX IF NOT EXISTS idx_store_requests_assigned_approver_id ON public.store_requests(assigned_approver_id);
CREATE INDEX IF NOT EXISTS idx_store_requests_status ON public.store_requests(status);
CREATE INDEX IF NOT EXISTS idx_store_requests_created_at ON public.store_requests(created_at DESC);

-- Daily Reports Indexes
CREATE INDEX IF NOT EXISTS idx_daily_reports_department_id ON public.daily_reports(department_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_event_day_id ON public.daily_reports(event_day_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON public.daily_reports(status);

-- Department Narratives Indexes
CREATE INDEX IF NOT EXISTS idx_department_narratives_department_id ON public.department_narratives(department_id);
CREATE INDEX IF NOT EXISTS idx_department_narratives_event_day_id ON public.department_narratives(event_day_id);

-- HOD Assignments & Profiles Indexes
CREATE INDEX IF NOT EXISTS idx_hod_assignments_profile_id ON public.hod_assignments(profile_id);
CREATE INDEX IF NOT EXISTS idx_hod_assignments_department_id ON public.hod_assignments(department_id);

-- Notifications Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
