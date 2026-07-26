-- Migration: Durable Item Return Flow (Batch 6)
-- Run this script in the Supabase SQL Editor if required.

-- 1. Helper Function to return outstanding durable items per department
CREATE OR REPLACE FUNCTION public.get_outstanding_durable_items()
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
BEGIN
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
    AND (item_elem->>'category' = 'durable' OR item_elem->>'category' IS NULL)
    AND COALESCE(item_elem->>'return_status', 'outstanding') IN ('outstanding', 'return_initiated', 'returned_damaged', 'lost');
END;
$$;
