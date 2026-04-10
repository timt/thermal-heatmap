/*
  Warnings:

  - You are about to drop the column `callsign` on the `live_positions` table. All the data in the column will be lost.
  - You are about to drop the column `heading` on the `live_positions` table. All the data in the column will be lost.
  - You are about to drop the column `icaoHex` on the `live_positions` table. All the data in the column will be lost.
  - You are about to drop the column `receiver` on the `live_positions` table. All the data in the column will be lost.
  - You are about to drop the column `speedKmh` on the `live_positions` table. All the data in the column will be lost.
  - You are about to drop the `ogn_devices` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `groundKt` to the `live_positions` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "live_positions_aircraftType_idx";

-- AlterTable
ALTER TABLE "live_positions" DROP COLUMN "callsign",
DROP COLUMN "heading",
DROP COLUMN "icaoHex",
DROP COLUMN "receiver",
DROP COLUMN "speedKmh",
ADD COLUMN     "groundKt" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "model" TEXT;

-- DropTable
DROP TABLE "ogn_devices";

-- CreateTable
CREATE TABLE "poll_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPositionTs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_state_pkey" PRIMARY KEY ("id")
);
