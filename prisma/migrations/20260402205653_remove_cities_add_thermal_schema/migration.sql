/*
  Warnings:

  - You are about to drop the `City` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "City";

-- CreateTable
CREATE TABLE "processed_dates" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "flightCount" INTEGER NOT NULL,
    "thermalCount" INTEGER NOT NULL DEFAULT 0,
    "algorithmVersion" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" SERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pilot" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "aircraft" TEXT NOT NULL,
    "registration" TEXT,
    "launchSite" TEXT NOT NULL,
    "launchLat" DOUBLE PRECISION NOT NULL,
    "launchLon" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "points" INTEGER,
    "sourceUrl" TEXT NOT NULL,
    "hasTrackData" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedDateId" INTEGER,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thermals" (
    "id" SERIAL NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "avgClimbRate" DOUBLE PRECISION NOT NULL,
    "altGain" DOUBLE PRECISION NOT NULL,
    "baseAlt" DOUBLE PRECISION NOT NULL,
    "topAlt" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3) NOT NULL,
    "flightId" INTEGER NOT NULL,

    CONSTRAINT "thermals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processed_dates_source_date_idx" ON "processed_dates"("source", "date");

-- CreateIndex
CREATE UNIQUE INDEX "processed_dates_source_date_key" ON "processed_dates"("source", "date");

-- CreateIndex
CREATE INDEX "flights_source_date_idx" ON "flights"("source", "date");

-- CreateIndex
CREATE UNIQUE INDEX "flights_sourceId_key" ON "flights"("sourceId");

-- CreateIndex
CREATE INDEX "thermals_flightId_idx" ON "thermals"("flightId");

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_processedDateId_fkey" FOREIGN KEY ("processedDateId") REFERENCES "processed_dates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thermals" ADD CONSTRAINT "thermals_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
