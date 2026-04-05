-- CreateTable
CREATE TABLE "live_positions" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "registration" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "altMetres" DOUBLE PRECISION NOT NULL,
    "heading" INTEGER NOT NULL,
    "speedKmh" DOUBLE PRECISION NOT NULL,
    "climbRateMs" DOUBLE PRECISION NOT NULL,
    "aircraftType" INTEGER NOT NULL,
    "receiver" TEXT NOT NULL,
    "icaoHex" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ogn_devices" (
    "deviceType" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "aircraftModel" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "cn" TEXT NOT NULL,
    "tracked" BOOLEAN NOT NULL,
    "identified" BOOLEAN NOT NULL,
    "aircraftType" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ogn_devices_pkey" PRIMARY KEY ("deviceId")
);

-- CreateIndex
CREATE INDEX "live_positions_fetchedAt_idx" ON "live_positions"("fetchedAt");

-- CreateIndex
CREATE INDEX "live_positions_aircraftType_idx" ON "live_positions"("aircraftType");

-- CreateIndex
CREATE UNIQUE INDEX "live_positions_deviceId_timestamp_key" ON "live_positions"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "ogn_devices_registration_idx" ON "ogn_devices"("registration");
