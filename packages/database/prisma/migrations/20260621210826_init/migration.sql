-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'REVISOR_FISCAL', 'RESIDENT', 'GUARD');

-- CreateEnum
CREATE TYPE "OccupancyType" AS ENUM ('OWNER', 'OWNER_ABSENT', 'TENANT');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('ADMIN_ONLY', 'UNIT_OWNER', 'UNIT_OCCUPANT', 'ALL_RESIDENTS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_UPLOAD', 'ACTIVE', 'SUPERSEDED', 'DELETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PSE', 'NEQUI', 'DAVIPLATA', 'CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('PRE_AUTHORIZED', 'CHECKED_IN', 'CHECKED_OUT', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PqrCategory" AS ENUM ('NOISE', 'MAINTENANCE', 'SECURITY', 'FINANCIAL', 'COEXISTENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PqrStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AsambleaStatus" AS ENUM ('SCHEDULED', 'QUORUM_OPEN', 'IN_PROGRESS', 'VOTING_CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "conjuntos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "reglamento_ph_url" TEXT,
    "total_units" INTEGER NOT NULL,
    "mora_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.0150,
    "pronto_pago_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conjuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_number" TEXT NOT NULL,
    "floor" INTEGER,
    "tower" TEXT,
    "coeficiente" DECIMAL(10,6) NOT NULL,
    "monthly_fee" DECIMAL(12,2) NOT NULL,
    "is_commercial" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "external_auth_id" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "cedula_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "push_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_occupancies" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "occupancy_type" "OccupancyType" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "lease_document_id" TEXT,

    CONSTRAINT "unit_occupancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "r2_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "file_size_bytes" INTEGER NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'ADMIN_ONLY',
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "superseded_by_id" TEXT,
    "contains_pii" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "accessed_by" TEXT NOT NULL,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "late_fee_rate" DECIMAL(5,4) NOT NULL,
    "pronto_pago_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "billing_period_id" TEXT NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "late_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pronto_pago_rate" DECIMAL(5,4),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "charge_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_name" TEXT,
    "gateway_reference" TEXT,
    "gateway_payload" JSONB,
    "pse_bank_code" TEXT,
    "nequi_phone" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pqrs" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "submitted_by_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "category" "PqrCategory" NOT NULL,
    "status" "PqrStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachments" TEXT[],
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pqrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pqr_comments" (
    "id" TEXT NOT NULL,
    "pqr_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pqr_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asambleas" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "quorum_percentage" DECIMAL(5,2) NOT NULL,
    "quorum_reached_at" TIMESTAMP(3),
    "status" "AsambleaStatus" NOT NULL DEFAULT 'SCHEDULED',
    "acta_document_id" TEXT,
    "meeting_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asambleas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asamblea_agenda_items" (
    "id" TEXT NOT NULL,
    "asamblea_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "voting_open" BOOLEAN NOT NULL DEFAULT false,
    "voting_closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asamblea_agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asamblea_attendances" (
    "id" TEXT NOT NULL,
    "asamblea_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "is_proxy" BOOLEAN NOT NULL DEFAULT false,
    "proxy_for_user_id" TEXT,
    "poder_document_id" TEXT,
    "coeficiente" DECIMAL(10,6) NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asamblea_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asamblea_votes" (
    "id" TEXT NOT NULL,
    "asamblea_id" TEXT NOT NULL,
    "agenda_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "vote_value" TEXT NOT NULL,
    "coeficiente" DECIMAL(10,6) NOT NULL,
    "vote_hash" TEXT NOT NULL,
    "voted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asamblea_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_qr_codes" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "qr_token" TEXT NOT NULL,
    "status" "VisitorStatus" NOT NULL DEFAULT 'PRE_AUTHORIZED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_logs" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "qr_code_id" TEXT,
    "visitor_name" TEXT NOT NULL,
    "cedula_encrypted" TEXT,
    "habeas_data_accepted" BOOLEAN NOT NULL DEFAULT false,
    "status" "VisitorStatus" NOT NULL,
    "guard_user_id" TEXT,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "purge_after" TIMESTAMP(3) NOT NULL DEFAULT NOW() + INTERVAL '30 days',

    CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_logs" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "tracking_number" TEXT,
    "description" TEXT,
    "package_photo_key" TEXT,
    "guard_user_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picked_up_by_id" TEXT,
    "picked_up_at" TIMESTAMP(3),

    CONSTRAINT "delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conjuntos_nit_key" ON "conjuntos"("nit");

-- CreateIndex
CREATE INDEX "units_conjunto_id_idx" ON "units"("conjunto_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_conjunto_id_unit_number_key" ON "units"("conjunto_id", "unit_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_auth_id_key" ON "users"("external_auth_id");

-- CreateIndex
CREATE INDEX "users_conjunto_id_idx" ON "users"("conjunto_id");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "unit_occupancies_unit_id_idx" ON "unit_occupancies"("unit_id");

-- CreateIndex
CREATE INDEX "unit_occupancies_user_id_idx" ON "unit_occupancies"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_occupancies_unit_id_occupancy_type_ended_at_key" ON "unit_occupancies"("unit_id", "occupancy_type", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "documents_r2_key_key" ON "documents"("r2_key");

-- CreateIndex
CREATE INDEX "documents_conjunto_id_idx" ON "documents"("conjunto_id");

-- CreateIndex
CREATE INDEX "documents_unit_id_idx" ON "documents"("unit_id");

-- CreateIndex
CREATE INDEX "document_access_logs_document_id_idx" ON "document_access_logs"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_conjunto_id_period_month_period_year_key" ON "billing_periods"("conjunto_id", "period_month", "period_year");

-- CreateIndex
CREATE INDEX "charges_unit_id_idx" ON "charges"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_reference_key" ON "payments"("gateway_reference");

-- CreateIndex
CREATE INDEX "payments_conjunto_id_idx" ON "payments"("conjunto_id");

-- CreateIndex
CREATE INDEX "payments_unit_id_idx" ON "payments"("unit_id");

-- CreateIndex
CREATE INDEX "payments_gateway_reference_idx" ON "payments"("gateway_reference");

-- CreateIndex
CREATE INDEX "pqrs_conjunto_id_idx" ON "pqrs"("conjunto_id");

-- CreateIndex
CREATE INDEX "pqr_comments_pqr_id_idx" ON "pqr_comments"("pqr_id");

-- CreateIndex
CREATE UNIQUE INDEX "asambleas_acta_document_id_key" ON "asambleas"("acta_document_id");

-- CreateIndex
CREATE INDEX "asambleas_conjunto_id_idx" ON "asambleas"("conjunto_id");

-- CreateIndex
CREATE UNIQUE INDEX "asamblea_attendances_asamblea_id_unit_id_key" ON "asamblea_attendances"("asamblea_id", "unit_id");

-- CreateIndex
CREATE INDEX "asamblea_votes_asamblea_id_idx" ON "asamblea_votes"("asamblea_id");

-- CreateIndex
CREATE UNIQUE INDEX "asamblea_votes_agenda_item_id_unit_id_key" ON "asamblea_votes"("agenda_item_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_qr_codes_qr_token_key" ON "visitor_qr_codes"("qr_token");

-- CreateIndex
CREATE INDEX "visitor_qr_codes_qr_token_idx" ON "visitor_qr_codes"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_logs_qr_code_id_key" ON "visitor_logs"("qr_code_id");

-- CreateIndex
CREATE INDEX "visitor_logs_conjunto_id_idx" ON "visitor_logs"("conjunto_id");

-- CreateIndex
CREATE INDEX "visitor_logs_unit_id_idx" ON "visitor_logs"("unit_id");

-- CreateIndex
CREATE INDEX "delivery_logs_conjunto_id_idx" ON "delivery_logs"("conjunto_id");

-- CreateIndex
CREATE INDEX "delivery_logs_unit_id_idx" ON "delivery_logs"("unit_id");

-- CreateIndex
CREATE INDEX "audit_logs_conjunto_id_idx" ON "audit_logs"("conjunto_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_occupancies" ADD CONSTRAINT "unit_occupancies_lease_document_id_fkey" FOREIGN KEY ("lease_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_billing_period_id_fkey" FOREIGN KEY ("billing_period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs" ADD CONSTRAINT "pqrs_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs" ADD CONSTRAINT "pqrs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs" ADD CONSTRAINT "pqrs_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqrs" ADD CONSTRAINT "pqrs_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqr_comments" ADD CONSTRAINT "pqr_comments_pqr_id_fkey" FOREIGN KEY ("pqr_id") REFERENCES "pqrs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asambleas" ADD CONSTRAINT "asambleas_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asambleas" ADD CONSTRAINT "asambleas_acta_document_id_fkey" FOREIGN KEY ("acta_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_agenda_items" ADD CONSTRAINT "asamblea_agenda_items_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "asambleas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_attendances" ADD CONSTRAINT "asamblea_attendances_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "asambleas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_attendances" ADD CONSTRAINT "asamblea_attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_votes" ADD CONSTRAINT "asamblea_votes_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "asambleas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_votes" ADD CONSTRAINT "asamblea_votes_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "asamblea_agenda_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_votes" ADD CONSTRAINT "asamblea_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asamblea_votes" ADD CONSTRAINT "asamblea_votes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_qr_codes" ADD CONSTRAINT "visitor_qr_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "visitor_qr_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
