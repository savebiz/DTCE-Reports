-- Migration: Complete Platform-Wide Multi-Event Data Isolation
-- Fixes all remaining RPCs, RLS helpers, triggers, and tables that could leak
-- Convention 2026 data into Congress 2026 (or future events).

-- 1. Scope get_inventory_stock_summary by event_id
DROP FUNCTION IF EXISTS public.get_inventory_stock_summary(TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.get_inventory_stock_summary(
  p_category TEXT DEFAULT NULL,
  p_only_low_stock BOOLEAN DEFAULT FALSE,
  p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  unit TEXT,
  current_stock INT,
  low_stock_threshold INT,
  is_low_stock BOOLEAN,
  total_restocked BIGINT,
  total_fulfilled BIGINT
) AS $$
DECLARE
  v_event_id UUID := p_event_id;
BEGIN
  IF v_event_id IS NULL THEN
    SELECT e.id INTO v_event_id FROM public.events e WHERE e.is_current = true LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.category,
    i.unit,
    i.current_stock,
    i.low_stock_threshold,
    (i.current_stock <= i.low_stock_threshold) AS is_low_stock,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'restock' THEN t.quantity_change ELSE 0 END), 0)::BIGINT AS total_restocked,
    COALESCE(ABS(SUM(CASE WHEN t.transaction_type = 'fulfillment_deduction' THEN t.quantity_change ELSE 0 END)), 0)::BIGINT AS total_fulfilled
  FROM public.inventory_items i
  LEFT JOIN public.inventory_transactions t
    ON t.inventory_item_id = i.id
   AND (v_event_id IS NULL OR t.event_id = v_event_id)
  WHERE (p_category IS NULL OR i.category = p_category)
    AND (p_only_low_stock IS FALSE OR i.current_stock <= i.low_stock_threshold)
  GROUP BY i.id, i.name, i.category, i.unit, i.current_stock, i.low_stock_threshold
  ORDER BY (i.current_stock <= i.low_stock_threshold) DESC, i.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Scope get_inventory_department_consumption by event_id
DROP FUNCTION IF EXISTS public.get_inventory_department_consumption(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[]);
CREATE OR REPLACE FUNCTION public.get_inventory_department_consumption(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_dept_ids UUID[] DEFAULT NULL,
  p_item_ids UUID[] DEFAULT NULL,
  p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  department_id UUID,
  department_name TEXT,
  item_id UUID,
  item_name TEXT,
  unit TEXT,
  total_fulfilled_qty BIGINT,
  fulfillment_count BIGINT
) AS $$
DECLARE
  v_event_id UUID := p_event_id;
BEGIN
  IF v_event_id IS NULL THEN
    SELECT e.id INTO v_event_id FROM public.events e WHERE e.is_current = true LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    d.id AS department_id,
    d.name AS department_name,
    i.id AS item_id,
    i.name AS item_name,
    i.unit,
    COALESCE(ABS(SUM(t.quantity_change)), 0)::BIGINT AS total_fulfilled_qty,
    COUNT(t.id)::BIGINT AS fulfillment_count
  FROM public.inventory_transactions t
  JOIN public.inventory_items i ON i.id = t.inventory_item_id
  JOIN public.store_requests r ON r.id = t.related_requisition_id
  JOIN public.departments d ON d.id = r.department_id
  WHERE t.transaction_type = 'fulfillment_deduction'
    AND (v_event_id IS NULL OR t.event_id = v_event_id OR r.event_id = v_event_id)
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
    AND (p_dept_ids IS NULL OR CARDINALITY(p_dept_ids) = 0 OR d.id = ANY(p_dept_ids))
    AND (p_item_ids IS NULL OR CARDINALITY(p_item_ids) = 0 OR i.id = ANY(p_item_ids))
  GROUP BY d.id, d.name, i.id, i.name, i.unit
  ORDER BY total_fulfilled_qty DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Scope get_outstanding_durable_items by event_id
DROP FUNCTION IF EXISTS public.get_outstanding_durable_items();
CREATE OR REPLACE FUNCTION public.get_outstanding_durable_items(
  p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  request_id UUID,
  department_id UUID,
  department_name TEXT,
  item_id TEXT,
  item_name TEXT,
  item_code TEXT,
  quantity_issued INT,
  quantity_returned INT,
  outstanding_quantity INT,
  return_status TEXT,
  delivered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID := p_event_id;
BEGIN
  IF v_event_id IS NULL THEN
    SELECT e.id INTO v_event_id FROM public.events e WHERE e.is_current = true LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    sr.id AS request_id,
    sr.department_id,
    d.name AS department_name,
    (item_elem->>'inventory_item_id')::TEXT AS item_id,
    (item_elem->>'name')::TEXT AS item_name,
    (item_elem->>'item_code')::TEXT AS item_code,
    COALESCE((item_elem->>'approved_quantity')::INT, (item_elem->>'quantity')::INT, 0) AS quantity_issued,
    COALESCE((item_elem->>'returned_quantity')::INT, 0) AS quantity_returned,
    (COALESCE((item_elem->>'approved_quantity')::INT, (item_elem->>'quantity')::INT, 0) - COALESCE((item_elem->>'returned_quantity')::INT, 0)) AS outstanding_quantity,
    COALESCE(item_elem->>'return_status', 'outstanding') AS return_status,
    sr.reviewed_at AS delivered_at
  FROM public.store_requests sr
  JOIN public.departments d ON d.id = sr.department_id,
  jsonb_array_elements(sr.items_json) AS item_elem
  WHERE sr.status IN ('delivered', 'ready_for_collection', 'partially_fulfilled')
    AND (v_event_id IS NULL OR sr.event_id = v_event_id)
    AND (item_elem->>'category' = 'durable' OR item_elem->>'category' IS NULL)
    AND COALESCE(item_elem->>'return_status', 'outstanding') IN ('outstanding', 'return_initiated', 'returned_damaged', 'lost');
END;
$$;

-- 4. Scope is_stores_staff() to the current event
CREATE OR REPLACE FUNCTION public.is_stores_staff(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hod_assignments ha
    JOIN public.departments d ON d.id = ha.department_id
    WHERE ha.profile_id = p_uid
      AND d.name ILIKE '%store%'
      AND ha.event_id = (SELECT id FROM public.events WHERE is_current = true LIMIT 1)
  );
$$;

-- 5. Improve set_inventory_transaction_event_id() to inherit from related_requisition_id first
CREATE OR REPLACE FUNCTION public.set_inventory_transaction_event_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.event_id IS NULL AND NEW.related_requisition_id IS NOT NULL THEN
    SELECT event_id INTO NEW.event_id
    FROM public.store_requests
    WHERE id = NEW.related_requisition_id;
  END IF;

  IF NEW.event_id IS NULL THEN
    SELECT id INTO NEW.event_id
    FROM public.events
    WHERE is_current = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Scope platform_feedback and challenge_resolutions by event_id
ALTER TABLE public.platform_feedback
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_platform_feedback_event_id
  ON public.platform_feedback(event_id);

ALTER TABLE public.challenge_resolutions
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_challenge_resolutions_event_id
  ON public.challenge_resolutions(event_id);

-- Backfill historical feedback & challenge resolutions to Convention (or earliest non-current event)
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
    UPDATE public.platform_feedback SET event_id = v_convention_event_id WHERE event_id IS NULL;
    UPDATE public.challenge_resolutions SET event_id = v_convention_event_id WHERE event_id IS NULL;
  END IF;
END $$;
