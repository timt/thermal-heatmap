-- CreateTable
CREATE TABLE "live_thermals" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "avgClimbRate" DOUBLE PRECISION NOT NULL,
    "altGain" DOUBLE PRECISION NOT NULL,
    "baseAlt" DOUBLE PRECISION NOT NULL,
    "topAlt" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_thermals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_thermals_detectedAt_idx" ON "live_thermals"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "live_thermals_deviceId_entryTime_key" ON "live_thermals"("deviceId", "entryTime");
