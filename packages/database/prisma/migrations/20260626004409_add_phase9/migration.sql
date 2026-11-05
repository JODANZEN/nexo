-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE 'AUTO_CHARGE';

-- AlterTable
ALTER TABLE "conjuntos" ADD COLUMN     "parking_rate_per_hour" DECIMAL(12,2) NOT NULL DEFAULT 3500;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reconciled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "purge_after" SET DEFAULT NOW() + INTERVAL '30 days';

-- CreateTable
CREATE TABLE "recurring_mandates" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "wompi_source_id" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_spots" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "spot_number" TEXT NOT NULL,
    "spot_type" TEXT NOT NULL DEFAULT 'VISITOR',
    "unit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_sessions" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "spot_id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "visitor_name" TEXT,
    "unit_visited" TEXT,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exited_at" TIMESTAMP(3),
    "amount_charged" DECIMAL(12,2),

    CONSTRAINT "parking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_mandates_conjunto_id_idx" ON "recurring_mandates"("conjunto_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_mandates_unit_id_status_key" ON "recurring_mandates"("unit_id", "status");

-- CreateIndex
CREATE INDEX "parking_spots_conjunto_id_idx" ON "parking_spots"("conjunto_id");

-- CreateIndex
CREATE UNIQUE INDEX "parking_spots_conjunto_id_spot_number_key" ON "parking_spots"("conjunto_id", "spot_number");

-- CreateIndex
CREATE INDEX "parking_sessions_conjunto_id_idx" ON "parking_sessions"("conjunto_id");

-- CreateIndex
CREATE INDEX "parking_sessions_spot_id_idx" ON "parking_sessions"("spot_id");

-- AddForeignKey
ALTER TABLE "recurring_mandates" ADD CONSTRAINT "recurring_mandates_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_mandates" ADD CONSTRAINT "recurring_mandates_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "parking_spots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
