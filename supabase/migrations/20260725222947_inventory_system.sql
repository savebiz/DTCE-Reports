-- Migration: DTCE Inventory System (Batch 1 of 5)
-- Run this in the Supabase SQL Editor

-- 1. Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('durable', 'consumable')),
  unit TEXT NOT NULL,
  current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create append-only inventory_transactions table (Never mutate stock without a transaction)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('restock', 'fulfillment_deduction', 'adjustment', 'return')),
  quantity_change INT NOT NULL,
  related_requisition_id UUID REFERENCES public.store_requests(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES public.profiles(id),
  note TEXT,
  resulting_stock_level INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_id ON public.inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON public.inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at ON public.inventory_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inventory_items
DROP POLICY IF EXISTS "Allow authenticated read inventory_items" ON public.inventory_items;
CREATE POLICY "Allow authenticated read inventory_items" ON public.inventory_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow stores and admin manage inventory_items" ON public.inventory_items;
CREATE POLICY "Allow stores and admin manage inventory_items" ON public.inventory_items
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'coordinator', 'national_coordinator')
        OR EXISTS (
          SELECT 1 FROM public.hod_assignments ha
          JOIN public.departments d ON d.id = ha.department_id
          WHERE ha.profile_id = p.id
          AND LOWER(d.name) LIKE '%store%'
        )
      )
    )
  );

-- RLS Policies for inventory_transactions
DROP POLICY IF EXISTS "Allow authenticated read inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Allow authenticated read inventory_transactions" ON public.inventory_transactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow stores and admin insert inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Allow stores and admin insert inventory_transactions" ON public.inventory_transactions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'coordinator', 'national_coordinator')
        OR EXISTS (
          SELECT 1 FROM public.hod_assignments ha
          JOIN public.departments d ON d.id = ha.department_id
          WHERE ha.profile_id = p.id
          AND LOWER(d.name) LIKE '%store%'
        )
      )
    )
  );

-- 3. Atomic Restock Stored Function
CREATE OR REPLACE FUNCTION process_inventory_restock(
  p_item_id UUID,
  p_restock_quantity INT,
  p_performed_by UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_new_stock INT;
  v_trans_id UUID;
BEGIN
  IF p_restock_quantity <= 0 THEN
    RAISE EXCEPTION 'Restock quantity must be greater than zero.';
  END IF;

  UPDATE public.inventory_items
  SET current_stock = current_stock + p_restock_quantity,
      updated_at = now()
  WHERE id = p_item_id
  RETURNING current_stock INTO v_new_stock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  INSERT INTO public.inventory_transactions (
    inventory_item_id,
    transaction_type,
    quantity_change,
    performed_by,
    note,
    resulting_stock_level
  ) VALUES (
    p_item_id,
    'restock',
    p_restock_quantity,
    p_performed_by,
    p_note,
    v_new_stock
  ) RETURNING id INTO v_trans_id;

  RETURN json_build_object(
    'success', true,
    'new_stock', v_new_stock,
    'transaction_id', v_trans_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atomic Fulfillment Deduction Stored Function
CREATE OR REPLACE FUNCTION process_inventory_fulfillment(
  p_item_id UUID,
  p_deduct_quantity INT,
  p_requisition_id UUID,
  p_performed_by UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current_stock INT;
  v_new_stock INT;
  v_trans_id UUID;
BEGIN
  IF p_deduct_quantity <= 0 THEN
    RAISE EXCEPTION 'Deduction quantity must be greater than zero.';
  END IF;

  SELECT current_stock INTO v_current_stock
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
      updated_at = now()
  WHERE id = p_item_id
  RETURNING current_stock INTO v_new_stock;

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
    'transaction_id', v_trans_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
