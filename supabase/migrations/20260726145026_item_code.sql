-- Migration: Add optional item_code field to inventory_items
-- Run this in the Supabase SQL Editor.

-- 1. Add item_code column to inventory_items
ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS item_code TEXT UNIQUE;

-- 2. Create index for fast item_code lookup
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_code 
  ON public.inventory_items(item_code);
