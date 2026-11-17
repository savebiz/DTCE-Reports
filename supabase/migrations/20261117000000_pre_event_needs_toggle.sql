-- ============================================================
-- Per-Event On/Off Toggle for Pre-Event Needs & Market Procurement
-- ============================================================
-- Defaults to false so new/upcoming editions hide the Pre-Event
-- Needs List, Market List, and Non-Store Tracker until explicitly
-- enabled by a Super Admin in Settings -> Events & Windows.
-- Historical events that already contain pre_event requests are
-- backfilled to true so historical records remain visible.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS pre_event_needs_enabled boolean NOT NULL DEFAULT false;

UPDATE public.events e
SET pre_event_needs_enabled = true
WHERE EXISTS (
  SELECT 1
  FROM public.store_requests sr
  WHERE sr.event_id = e.id
    AND sr.request_type = 'pre_event'
);
