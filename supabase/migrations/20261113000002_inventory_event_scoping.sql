-- Migration: Scope inventory_transactions by event_id
-- Preserves Convention's 277 historical transactions under Convention while
-- giving Congress 2026 (and future events) a clean, isolated Transaction Audit Ledger.

-- 1. Add event_id column to inventory_transactions
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_event_id
  ON public.inventory_transactions(event_id);

-- 2. Backfill existing transactions from linked store_requests where available
UPDATE public.inventory_transactions t
SET event_id = sr.event_id
FROM public.store_requests sr
WHERE t.related_requisition_id = sr.id
  AND t.event_id IS NULL
  AND sr.event_id IS NOT NULL;

-- 3. Backfill any remaining unlinked historical transactions to Convention (or earliest non-current event)
DO $$
DECLARE
  v_convention_event_id UUID;
BEGIN
  SELECT id INTO v_convention_event_id
  FROM public.events
  WHERE name ILIKE '%convention%'
  ORDER BY start_date ASC NULLS LAST
  LIMIT 1;

  IF v_convention_event_id IS NULL THEN
    SELECT id INTO v_convention_event_id
    FROM public.events
    WHERE is_current = false
    ORDER BY start_date ASC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_convention_event_id IS NOT NULL THEN
    UPDATE public.inventory_transactions
    SET event_id = v_convention_event_id
    WHERE event_id IS NULL;
  END IF;
END $$;

-- 4. Automatically stamp event_id on every new inventory_transaction insert
CREATE OR REPLACE FUNCTION public.set_inventory_transaction_event_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.event_id IS NULL THEN
    SELECT id INTO NEW.event_id
    FROM public.events
    WHERE is_current = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_transactions_set_event_id ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_set_event_id
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inventory_transaction_event_id();
