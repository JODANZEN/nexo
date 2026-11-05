-- CreateEnum
CREATE TYPE "PqrPriority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "PqrScope" AS ENUM ('IN_UNIT', 'FACILITY', 'INTERNAL_OPS');

-- AlterEnum
ALTER TYPE "PqrStatus" ADD VALUE 'AWAITING_RESIDENT';

-- AlterTable
ALTER TABLE "pqrs" ADD COLUMN     "awaiting_since" TIMESTAMP(3),
ADD COLUMN     "escalation_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "first_responded_at" TIMESTAMP(3),
ADD COLUMN     "first_response_due_at" TIMESTAMP(3),
ADD COLUMN     "paused_ms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priority" "PqrPriority" NOT NULL DEFAULT 'P3',
ADD COLUMN     "resolution_due_at" TIMESTAMP(3),
ADD COLUMN     "scope" "PqrScope" NOT NULL DEFAULT 'IN_UNIT',
ADD COLUMN     "sla_breached" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "purge_after" SET DEFAULT NOW() + INTERVAL '30 days';

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_conjunto_id_idx" ON "notifications"("conjunto_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
