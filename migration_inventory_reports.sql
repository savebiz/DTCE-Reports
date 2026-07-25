-- Migration: DTCE Inventory System — Batch 3: Reports & Insights
-- Server-side SQL Aggregation Functions for High-Performance Inventory Analytics

-- 1. Stock Level Summary Function (Server-side aggregation)
CREATE OR REPLACE FUNCTION get_inventory_stock_summary(
  p_category TEXT DEFAULT NULL,
  p_only_low_stock BOOLEAN DEFAULT FALSE
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
BEGIN
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
  LEFT JOIN public.inventory_transactions t ON t.inventory_item_id = i.id
  WHERE (p_category IS NULL OR i.category = p_category)
    AND (p_only_low_stock IS FALSE OR i.current_stock <= i.low_stock_threshold)
  GROUP BY i.id, i.name, i.category, i.unit, i.current_stock, i.low_stock_threshold
  ORDER BY (i.current_stock <= i.low_stock_threshold) DESC, i.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Department Consumption Aggregation Function (Equitable Distribution Oversight)
CREATE OR REPLACE FUNCTION get_inventory_department_consumption(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_dept_ids UUID[] DEFAULT NULL,
  p_item_ids UUID[] DEFAULT NULL
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
BEGIN
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
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
    AND (p_dept_ids IS NULL OR CARDINALITY(p_dept_ids) = 0 OR d.id = ANY(p_dept_ids))
    AND (p_item_ids IS NULL OR CARDINALITY(p_item_ids) = 0 OR i.id = ANY(p_item_ids))
  GROUP BY d.id, d.name, i.id, i.name, i.unit
  ORDER BY total_fulfilled_qty DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
