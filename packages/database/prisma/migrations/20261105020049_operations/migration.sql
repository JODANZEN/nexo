-- Operations (2026-11): STAFF role, per-client SLA + business hours, ticket
-- routing rules, entry authorizations, preventive maintenance plans.

-- CreateEnum
CREATE TYPE "EntryAuthorizationStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'USED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'STAFF';

-- AlterTable
ALTER TABLE "conjuntos" ADD COLUMN     "business_hours" JSONB,
ADD COLUMN     "sla_config" JSONB;

-- AlterTable
ALTER TABLE "pqrs" ADD COLUMN     "maintenance_plan_id" TEXT,
ADD COLUMN     "first_response_alerted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "team" TEXT;

-- CreateTable
CREATE TABLE "pqr_routing_rules" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PqrCategory",
    "scope" "PqrScope",
    "assignee_ids" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pqr_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_authorizations" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "pqr_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "status" "EntryAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" "PqrScope" NOT NULL DEFAULT 'FACILITY',
    "priority" "PqrPriority" NOT NULL DEFAULT 'P3',
    "unit_id" TEXT,
    "assigned_to_id" TEXT,
    "interval_unit" TEXT NOT NULL,
    "interval_count" INTEGER NOT NULL DEFAULT 1,
    "next_due_at" TIMESTAMP(3) NOT NULL,
    "lead_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "last_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pqr_routing_rules_conjunto_id_idx" ON "pqr_routing_rules"("conjunto_id");

-- CreateIndex
CREATE UNIQUE INDEX "entry_authorizations_token_hash_key" ON "entry_authorizations"("token_hash");

-- CreateIndex
CREATE INDEX "entry_authorizations_conjunto_id_status_idx" ON "entry_authorizations"("conjunto_id", "status");

-- CreateIndex
CREATE INDEX "entry_authorizations_pqr_id_idx" ON "entry_authorizations"("pqr_id");

-- CreateIndex
CREATE INDEX "maintenance_plans_conjunto_id_idx" ON "maintenance_plans"("conjunto_id");

-- CreateIndex
CREATE INDEX "maintenance_plans_is_active_next_due_at_idx" ON "maintenance_plans"("is_active", "next_due_at");

-- CreateIndex
CREATE INDEX "pqrs_assigned_to_id_status_idx" ON "pqrs"("assigned_to_id", "status");

-- AddForeignKey
ALTER TABLE "pqrs" ADD CONSTRAINT "pqrs_maintenance_plan_id_fkey" FOREIGN KEY ("maintenance_plan_id") REFERENCES "maintenance_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqr_routing_rules" ADD CONSTRAINT "pqr_routing_rules_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_authorizations" ADD CONSTRAINT "entry_authorizations_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_authorizations" ADD CONSTRAINT "entry_authorizations_pqr_id_fkey" FOREIGN KEY ("pqr_id") REFERENCES "pqrs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security for the new tenant tables (same pattern as 20261102200000).
GRANT SELECT, INSERT, UPDATE, DELETE ON "pqr_routing_rules", "entry_authorizations", "maintenance_plans" TO nexo_rls;

ALTER TABLE "pqr_routing_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pqr_routing_rules" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));

ALTER TABLE "entry_authorizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "entry_authorizations" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));

ALTER TABLE "maintenance_plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "maintenance_plans" TO nexo_rls
  USING (conjunto_id = current_setting('app.conjunto_id', true))
  WITH CHECK (conjunto_id = current_setting('app.conjunto_id', true));
