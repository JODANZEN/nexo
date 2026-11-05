-- Row-level security (2026-11).
--
-- Model: system code (crons, queue workers, webhooks, onboarding, migrations) runs
-- as the connection's own role, which owns the tables and is NOT subject to these
-- policies. Every query made on behalf of a signed-in user of a conjunto runs inside
-- a transaction that does `SET LOCAL ROLE nexo_rls` + `set_config('app.conjunto_id')`
-- (apps/api/src/prisma/prisma.service.ts). nexo_rls is not the owner and has no
-- BYPASSRLS, so the policies below apply: a bug in a service that forgets to filter
-- by conjunto returns nothing instead of another tenant's rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_rls') THEN
    CREATE ROLE nexo_rls NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Let the app's login role switch into nexo_rls.
DO $$
BEGIN
  EXECUTE format('GRANT nexo_rls TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO nexo_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_rls;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexo_rls;
-- Tables created by future migrations (run by this same role) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nexo_rls;

-- The tenant itself.
ALTER TABLE "conjuntos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conjuntos" TO nexo_rls
  USING (id = current_setting('app.conjunto_id', true))
  WITH CHECK (id = current_setting('app.conjunto_id', true));

-- Tables that carry conjunto_id directly.
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "units" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "documents" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "billing_periods" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "billing_periods" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "pqrs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pqrs" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "asambleas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asambleas" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "visitor_qr_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visitor_qr_codes" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "visitor_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visitor_logs" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "delivery_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery_logs" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "consent_records" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "inspections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inspections" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "recurring_mandates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recurring_mandates" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "parking_spots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "parking_spots" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "parking_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "parking_sessions" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "amenities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "amenities" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reservations" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "providers" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "announcements" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
ALTER TABLE "room_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "room_types" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));

-- Child tables: visible only when their parent row is (the parent policy applies inside EXISTS).
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "charges" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "units" p WHERE p.id = "charges".unit_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "units" p WHERE p.id = "charges".unit_id));
ALTER TABLE "unit_occupancies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "unit_occupancies" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "units" p WHERE p.id = "unit_occupancies".unit_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "units" p WHERE p.id = "unit_occupancies".unit_id));
ALTER TABLE "pqr_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pqr_comments" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "pqrs" p WHERE p.id = "pqr_comments".pqr_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "pqrs" p WHERE p.id = "pqr_comments".pqr_id));
ALTER TABLE "asamblea_agenda_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asamblea_agenda_items" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "asambleas" p WHERE p.id = "asamblea_agenda_items".asamblea_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "asambleas" p WHERE p.id = "asamblea_agenda_items".asamblea_id));
ALTER TABLE "asamblea_attendances" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asamblea_attendances" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "asambleas" p WHERE p.id = "asamblea_attendances".asamblea_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "asambleas" p WHERE p.id = "asamblea_attendances".asamblea_id));
ALTER TABLE "asamblea_votes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asamblea_votes" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "asambleas" p WHERE p.id = "asamblea_votes".asamblea_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "asambleas" p WHERE p.id = "asamblea_votes".asamblea_id));
ALTER TABLE "inspection_rooms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inspection_rooms" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "inspections" p WHERE p.id = "inspection_rooms".inspection_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "inspections" p WHERE p.id = "inspection_rooms".inspection_id));
ALTER TABLE "inspection_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inspection_items" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "inspection_rooms" p WHERE p.id = "inspection_items".room_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "inspection_rooms" p WHERE p.id = "inspection_items".room_id));
ALTER TABLE "document_access_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_access_logs" TO nexo_rls
  USING (EXISTS (SELECT 1 FROM "documents" p WHERE p.id = "document_access_logs".document_id))
  WITH CHECK (EXISTS (SELECT 1 FROM "documents" p WHERE p.id = "document_access_logs".document_id));
