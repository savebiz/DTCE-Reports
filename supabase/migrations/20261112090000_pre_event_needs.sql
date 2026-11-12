-- Phase 1: pre-event departmental needs + Stores market list
-- Re-runnable and additive. Run AFTER 20261111120000_multi_event_foundation.sql.
--
--  1. store_requests.request_type: 'pre_event' (needs list sent BEFORE Stores
--     goes to market) vs 'during_event' (items requested from the store).
--  2. market_list_entries: one row per consolidated item per event, where
--     Stores records which market trip (batch) it belongs to and how much
--     was bought / received. Written only through the server API.

ALTER TABLE public.store_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'during_event';

ALTER TABLE public.store_requests DROP CONSTRAINT IF EXISTS store_requests_request_type_check;
ALTER TABLE public.store_requests
  ADD CONSTRAINT store_requests_request_type_check
  CHECK (request_type IN ('pre_event', 'during_event'));

CREATE INDEX IF NOT EXISTS idx_store_requests_event_type
  ON public.store_requests(event_id, request_type);

CREATE TABLE IF NOT EXISTS public.market_list_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  item_key      text NOT NULL,           -- inventory_item_id, or lower-cased name for free-text items
  item_name     text NOT NULL,
  unit          text,
  batch         int  CHECK (batch IS NULL OR batch BETWEEN 1 AND 9),  -- market trip number
  qty_bought    int  NOT NULL DEFAULT 0 CHECK (qty_bought >= 0),
  qty_received  int  NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  note          text,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_market_list_entries_event ON public.market_list_entries(event_id);

ALTER TABLE public.market_list_entries ENABLE ROW LEVEL SECURITY;

-- Read: admins and Stores staff. Writes go through the server API (service role).
DROP POLICY IF EXISTS "market_list_entries_select" ON public.market_list_entries;
CREATE POLICY "market_list_entries_select" ON public.market_list_entries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'coordinator', 'national_coordinator')
    )
    OR public.is_stores_staff()
  );

-- Check: both should return rows / zero violations
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'store_requests' AND column_name = 'request_type';
