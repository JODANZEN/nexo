-- AlterTable
ALTER TABLE "units" ADD COLUMN     "room_type_id" TEXT;

-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "purge_after" SET DEFAULT NOW() + INTERVAL '30 days';

-- CreateTable
CREATE TABLE "room_types" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "base_fee" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_types_conjunto_id_idx" ON "room_types"("conjunto_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_conjunto_id_name_key" ON "room_types"("conjunto_id", "name");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
