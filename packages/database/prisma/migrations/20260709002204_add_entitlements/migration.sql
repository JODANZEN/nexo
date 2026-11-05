-- AlterTable
ALTER TABLE "conjuntos" ADD COLUMN     "feature_overrides" JSONB,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "plan_status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "purge_after" SET DEFAULT NOW() + INTERVAL '30 days';
