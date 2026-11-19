-- CreateTable
CREATE TABLE "ModularField" (
    "id" TEXT NOT NULL,
    "crisisId" TEXT NOT NULL,
    "infraType" "InfraType" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'string',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "labels" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModularField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModularField_crisisId_infraType_fieldKey_key" ON "ModularField"("crisisId", "infraType", "fieldKey");

-- AddForeignKey
ALTER TABLE "ModularField" ADD CONSTRAINT "ModularField_crisisId_fkey" FOREIGN KEY ("crisisId") REFERENCES "Crisis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
