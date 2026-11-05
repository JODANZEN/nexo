-- AlterTable
ALTER TABLE "visitor_logs" ALTER COLUMN "purge_after" SET DEFAULT NOW() + INTERVAL '30 days';

-- CreateTable
CREATE TABLE "amenities" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "open_time" TEXT,
    "close_time" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "amenity_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "reserved_by_id" TEXT,
    "reserved_by_name" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "conjunto_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amenities_conjunto_id_idx" ON "amenities"("conjunto_id");

-- CreateIndex
CREATE INDEX "reservations_conjunto_id_idx" ON "reservations"("conjunto_id");

-- CreateIndex
CREATE INDEX "reservations_amenity_id_idx" ON "reservations"("amenity_id");

-- CreateIndex
CREATE INDEX "providers_conjunto_id_idx" ON "providers"("conjunto_id");

-- CreateIndex
CREATE INDEX "announcements_conjunto_id_idx" ON "announcements"("conjunto_id");

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_conjunto_id_fkey" FOREIGN KEY ("conjunto_id") REFERENCES "conjuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
