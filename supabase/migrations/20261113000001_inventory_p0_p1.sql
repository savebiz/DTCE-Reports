-- Inventory Best-Practice Upgrades (P0 & P1)
-- Additive and re-runnable. Run AFTER 20260725222947_inventory_system.sql & 20261112090000_pre_event_needs.sql.

-- 1. Stock reservation (soft-allocation), quarantine for damaged returns, and UOM normalization
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS reserved_stock INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quarantine_stock INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_unit TEXT,
  ADD COLUMN IF NOT EXISTS conversion_factor INT NOT NULL DEFAULT 1;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_reserved_stock_check;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_reserved_stock_check CHECK (reserved_stock >= 0);

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_quarantine_stock_check;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_quarantine_stock_check CHECK (quarantine_stock >= 0);

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_conversion_factor_check;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_conversion_factor_check CHECK (conversion_factor >= 1);

-- 2. Structured procurement costing & atomic stocked_qty on market_list_entries
ALTER TABLE public.market_list_entries
  ADD COLUMN IF NOT EXISTS stocked_qty INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS receipt_ref TEXT;

ALTER TABLE public.market_list_entries DROP CONSTRAINT IF EXISTS market_list_entries_stocked_qty_check;
ALTER TABLE public.market_list_entries
  ADD CONSTRAINT market_list_entries_stocked_qty_check CHECK (stocked_qty >= 0);

-- 3. Atomic Stock Reservation RPC (Soft-Allocation on Approval)
CREATE OR REPLACE FUNCTION public.reserve_inventory_stock(
  p_item_id UUID,
  p_reserve_quantity INT
)
RETURNS JSON AS $$
DECLARE
  v_current_stock INT;
  v_reserved_stock INT;
  v_available INT;
  v_new_reserved INT;
BEGIN
  IF p_reserve_quantity <= 0 THEN
    RAISE EXCEPTION 'Reserve quantity must be greater than zero.';
  END IF;

  SELECT current_stock, reserved_stock
  INTO v_current_stock, v_reserved_stock
  FROM public.inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  v_available := v_current_stock - v_reserved_stock;
  IF v_available < p_reserve_quantity THEN
    RAISE EXCEPTION 'Insufficient available stock to reserve. Available: %, Requested: %', v_available, p_reserve_quantity;
  END IF;

  UPDATE public.inventory_items
  SET reserved_stock = reserved_stock + p_reserve_quantity,
      updated_at = now()
  WHERE id = p_item_id
  RETURNING reserved_stock INTO v_new_reserved;

  RETURN json_build_object(
    'success', true,
    'reserved_stock', v_new_reserved,
    'available_stock', v_current_stock - v_new_reserved
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Atomic Reservation Release RPC (On Decline / Cancel)
CREATE OR REPLACE FUNCTION public.release_inventory_reservation(
  p_item_id UUID,
  p_release_quantity INT
)
RETURNS JSON AS $$
DECLARE
  v_new_reserved INT;
BEGIN
  IF p_release_quantity <= 0 THEN
    RAISE EXCEPTION 'Release quantity must be greater than zero.';
  END IF;

  UPDATE public.inventory_items
  SET reserved_stock = GREATEST(0, reserved_stock - p_release_quantity),
      updated_at = now()
  WHERE id = p_item_id
  RETURNING reserved_stock INTO v_new_reserved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  RETURN json_build_object(
    'success', true,
    'reserved_stock', v_new_reserved
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Updated Atomic Fulfillment Deduction RPC (supports releasing soft-allocation on handover)
DROP FUNCTION IF EXISTS public.process_inventory_fulfillment(UUID, INT, UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.process_inventory_fulfillment(
  p_item_id UUID,
  p_deduct_quantity INT,
  p_requisition_id UUID,
  p_performed_by UUID,
  p_note TEXT DEFAULT NULL,
  p_release_reservation INT DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_current_stock INT;
  v_reserved_stock INT;
  v_new_stock INT;
  v_new_reserved INT;
  v_trans_id UUID;
BEGIN
  IF p_deduct_quantity <= 0 THEN
    RAISE EXCEPTION 'Deduction quantity must be greater than zero.';
  END IF;

  SELECT current_stock, reserved_stock
  INTO v_current_stock, v_reserved_stock
  FROM public.inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  IF v_current_stock < p_deduct_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested deduction: %', v_current_stock, p_deduct_quantity;
  END IF;

  UPDATE public.inventory_items
  SET current_stock = current_stock - p_deduct_quantity,
      reserved_stock = GREATEST(0, reserved_stock - GREATEST(0, p_release_reservation)),
      updated_at = now()
  WHERE id = p_item_id
  RETURNING current_stock, reserved_stock INTO v_new_stock, v_new_reserved;

  INSERT INTO public.inventory_transactions (
    inventory_item_id,
    transaction_type,
    quantity_change,
    related_requisition_id,
    performed_by,
    note,
    resulting_stock_level
  ) VALUES (
    p_item_id,
    'fulfillment_deduction',
    -p_deduct_quantity,
    p_requisition_id,
    p_performed_by,
    p_note,
    v_new_stock
  ) RETURNING id INTO v_trans_id;

  RETURN json_build_object(
    'success', true,
    'new_stock', v_new_stock,
    'reserved_stock', v_new_reserved,
    'transaction_id', v_trans_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Atomic Durable Return RPC (good -> current_stock, damaged -> quarantine_stock, lost -> 0 change)
CREATE OR REPLACE FUNCTION public.process_inventory_return(
  p_item_id UUID,
  p_return_quantity INT,
  p_condition TEXT,
  p_requisition_id UUID,
  p_performed_by UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current_stock INT;
  v_quarantine_stock INT;
  v_qty_change INT := 0;
  v_trans_id UUID;
BEGIN
  IF p_return_quantity <= 0 THEN
    RAISE EXCEPTION 'Return quantity must be greater than zero.';
  END IF;

  IF p_condition NOT IN ('good', 'damaged', 'lost') THEN
    RAISE EXCEPTION 'Invalid return condition: %', p_condition;
  END IF;

  SELECT current_stock, quarantine_stock
  INTO v_current_stock, v_quarantine_stock
  FROM public.inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  IF p_condition = 'good' THEN
    UPDATE public.inventory_items
    SET current_stock = current_stock + p_return_quantity,
        updated_at = now()
    WHERE id = p_item_id
    RETURNING current_stock INTO v_current_stock;
    v_qty_change := p_return_quantity;
  ELSIF p_condition = 'damaged' THEN
    UPDATE public.inventory_items
    SET quarantine_stock = quarantine_stock + p_return_quantity,
        updated_at = now()
    WHERE id = p_item_id
    RETURNING quarantine_stock INTO v_quarantine_stock;
    v_qty_change := 0; -- Damaged items are quarantined, not added to issuable stock
  ELSE
    v_qty_change := 0;
  END IF;

  INSERT INTO public.inventory_transactions (
    inventory_item_id,
    transaction_type,
    quantity_change,
    related_requisition_id,
    performed_by,
    note,
    resulting_stock_level
  ) VALUES (
    p_item_id,
    'return',
    v_qty_change,
    p_requisition_id,
    p_performed_by,
    p_note,
    v_current_stock
  ) RETURNING id INTO v_trans_id;

  RETURN json_build_object(
    'success', true,
    'new_stock', v_current_stock,
    'quarantine_stock', v_quarantine_stock,
    'transaction_id', v_trans_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock down inventory mutation RPCs to service_role only (prevent direct browser RPC calls bypassing API RBAC)
REVOKE ALL ON FUNCTION public.reserve_inventory_stock(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory_stock(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.release_inventory_reservation(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_inventory_reservation(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.process_inventory_fulfillment(UUID, INT, UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_inventory_fulfillment(UUID, INT, UUID, UUID, TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.process_inventory_return(UUID, INT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_inventory_return(UUID, INT, TEXT, UUID, UUID, TEXT) TO service_role;
