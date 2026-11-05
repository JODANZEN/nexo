-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('MOVE_IN', 'MOVE_OUT', 'ROUTINE');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ADMIN_REVIEWED');

-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "purge_after" SET DEFAULT NOW() + INTERVAL '30 days';

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "occupancy_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_rooms" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "notes" TEXT,
    "photo_r2_keys" TEXT[],

    CONSTRAINT "inspection_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspections_conjunto_id_idx" ON "inspections"("conjunto_id");

-- CreateIndex
CREATE INDEX "inspections_unit_id_idx" ON "inspections"("unit_id");

-- CreateIndex
CREATE INDEX "inspection_rooms_inspection_id_idx" ON "inspection_rooms"("inspection_id");

-- CreateIndex
CREATE INDEX "inspection_items_room_id_idx" ON "inspection_items"("room_id");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_occupancy_id_fkey" FOREIGN KEY ("occupancy_id") REFERENCES "unit_occupancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_rooms" ADD CONSTRAINT "inspection_rooms_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "inspection_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
