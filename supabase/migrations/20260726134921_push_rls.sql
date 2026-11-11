-- Migration: Cross-Department Push Subscription Resolution Policy
-- Run this script in the Supabase SQL Editor if push notifications across departments are blocked by RLS.

-- 1. Drop restrictively scoped SELECT policy on push_subscriptions
DROP POLICY IF EXISTS "Users can read own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can read push subscriptions" ON public.push_subscriptions;

-- 2. Create permissive SELECT policy allowing authenticated system users to resolve recipient push tokens
CREATE POLICY "Users can read push subscriptions" ON public.push_subscriptions
  FOR SELECT USING (auth.role() = 'authenticated');

-- 3. Ensure notification_preferences can be read by authenticated users for dispatch checks
DROP POLICY IF EXISTS "Users can read notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can read notification preferences" ON public.notification_preferences
  FOR SELECT USING (auth.role() = 'authenticated');
