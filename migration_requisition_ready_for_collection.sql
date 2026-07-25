-- Migration: Add 'ready_for_collection' status to store_requests
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.store_requests DROP CONSTRAINT IF EXISTS store_requests_status_check;
ALTER TABLE public.store_requests ADD CONSTRAINT store_requests_status_check 
  CHECK (status IN ('pending_coordinator', 'approved', 'declined', 'in_progress', 'partially_fulfilled', 'ready_for_collection', 'delivered'));
