-- Row-level security.
--
-- The API talks to Postgres as the table owner and is not subject to these policies. They exist
-- for clients that connect directly through Supabase (Realtime order tracking, storage-backed
-- uploads) and as defence in depth: a leaked anon key can read the public catalogue and nothing
-- else.
--
-- Supabase provides the `auth` schema, `auth.uid()` and the `anon` / `authenticated` roles. Plain
-- Postgres (local development, CI) gets minimal stand-ins so the same policies apply everywhere.

CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $body$
        SELECT nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
          ),
          ''
        )::uuid
      $body$
    $fn$;
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships WHERE user_id = auth.uid() AND role IN ('OPS', 'ADMIN')
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.my_vendor_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT vendor_id FROM memberships
  WHERE user_id = auth.uid() AND role IN ('VENDOR_OWNER', 'VENDOR_STAFF') AND vendor_id IS NOT NULL
$$;
--> statement-breakpoint

-- Every table is locked down; policies below open exactly what each audience needs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cities', 'pincodes', 'categories', 'vendors', 'items', 'item_variants', 'inventory_slots',
    'packaging_profiles', 'rate_cards', 'serviceability_matrix', 'calendar_blackouts',
    'dispatch_batches', 'profiles', 'memberships', 'addresses', 'orders', 'shipments',
    'order_items', 'inventory_holds', 'shipment_events', 'payments', 'refunds', 'vendor_payouts',
    'claims', 'outbox', 'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Public catalogue ------------------------------------------------------------------------------
CREATE POLICY cities_public_read ON cities FOR SELECT TO anon, authenticated
  USING (launch_status IN ('LIVE', 'COMING_SOON'));
--> statement-breakpoint
CREATE POLICY pincodes_public_read ON pincodes FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY categories_public_read ON categories FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY vendors_public_read ON vendors FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE' OR id IN (SELECT public.my_vendor_ids()) OR public.is_staff());
--> statement-breakpoint
CREATE POLICY items_public_read ON items FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE' OR vendor_id IN (SELECT public.my_vendor_ids()) OR public.is_staff());
--> statement-breakpoint
CREATE POLICY variants_public_read ON item_variants FOR SELECT TO anon, authenticated
  USING (is_active);
--> statement-breakpoint

-- People ----------------------------------------------------------------------------------------
CREATE POLICY profiles_self ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff());
--> statement-breakpoint
CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--> statement-breakpoint
CREATE POLICY memberships_self ON memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());
--> statement-breakpoint
CREATE POLICY addresses_owner ON addresses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint

-- Orders: customers see their own, vendors see their parcels, ops see everything --------------
CREATE POLICY orders_read ON orders FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_staff());
--> statement-breakpoint
CREATE POLICY shipments_read ON shipments FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
    OR vendor_id IN (SELECT public.my_vendor_ids())
    OR public.is_staff()
  );
--> statement-breakpoint
CREATE POLICY order_items_read ON order_items FOR SELECT TO authenticated
  USING (shipment_id IN (SELECT id FROM shipments));
--> statement-breakpoint
CREATE POLICY shipment_events_read ON shipment_events FOR SELECT TO authenticated
  USING (shipment_id IN (SELECT id FROM shipments));
--> statement-breakpoint
CREATE POLICY payments_read ON payments FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders));
--> statement-breakpoint
CREATE POLICY refunds_read ON refunds FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders));
--> statement-breakpoint
CREATE POLICY claims_read ON claims FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_staff());
--> statement-breakpoint
CREATE POLICY payouts_vendor_read ON vendor_payouts FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT public.my_vendor_ids()) OR public.is_staff());
--> statement-breakpoint
CREATE POLICY batches_vendor_read ON dispatch_batches FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT public.my_vendor_ids()) OR public.is_staff());
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--> statement-breakpoint
GRANT UPDATE ON profiles TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON addresses TO authenticated;
