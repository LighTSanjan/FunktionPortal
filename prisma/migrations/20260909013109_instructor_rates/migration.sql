
-- AlterTable
ALTER TABLE "instructors" DROP COLUMN "hourly_rate_cents";

-- CreateTable
CREATE TABLE "instructor_rates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "hourly_rate_cents" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_rates_org_id_idx" ON "instructor_rates"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_rates_instructor_id_effective_from_key" ON "instructor_rates"("instructor_id", "effective_from");

-- AddForeignKey
ALTER TABLE "instructor_rates" ADD CONSTRAINT "instructor_rates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_rates" ADD CONSTRAINT "instructor_rates_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

