-- Requisition Window Gating for Pre-Event Needs Lists & Live Event Store Requisitions
-- Additive and re-runnable. Run AFTER 20261111120000_multi_event_foundation.sql.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS live_requisition_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS pre_event_override text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS live_requisition_override text NOT NULL DEFAULT 'auto';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_pre_event_override_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_pre_event_override_check
  CHECK (pre_event_override IN ('auto', 'force_open', 'force_closed'));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_live_requisition_override_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_live_requisition_override_check
  CHECK (live_requisition_override IN ('auto', 'force_open', 'force_closed'));
