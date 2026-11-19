CREATE TYPE "FieldMessageType" AS ENUM ('TEXT', 'SOS');

CREATE TABLE "FieldMessage" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "type" "FieldMessageType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    CONSTRAINT "FieldMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FieldMessage_content_nonempty" CHECK (length(btrim("content")) > 0),
    CONSTRAINT "FieldMessage_coordinates_valid" CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL) OR
      ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND
       "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
    )
);

CREATE INDEX "FieldMessage_deviceId_receivedAt_id_idx" ON "FieldMessage"("deviceId", "receivedAt", "id");
