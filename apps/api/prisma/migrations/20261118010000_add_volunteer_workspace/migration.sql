CREATE TYPE "VolunteerVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "VolunteerAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');
CREATE TYPE "VolunteerTaskStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "VolunteerAssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETION_SUBMITTED', 'COMPLETED', 'DECLINED');
CREATE TYPE "VolunteerCheckInStatus" AS ENUM ('SAFE', 'NEED_HELP');

CREATE TABLE "VolunteerProfile" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "phone" VARCHAR(40) NOT NULL,
 "location" VARCHAR(200) NOT NULL, "bio" VARCHAR(2000) NOT NULL DEFAULT '', "skills" TEXT[] NOT NULL,
 "emergencyContactName" VARCHAR(100) NOT NULL DEFAULT '', "emergencyContactPhone" VARCHAR(40) NOT NULL DEFAULT '',
 "verificationStatus" "VolunteerVerificationStatus" NOT NULL DEFAULT 'PENDING', "verifiedBy" TEXT, "verifiedAt" TIMESTAMP(3),
 "availability" "VolunteerAvailability" NOT NULL DEFAULT 'OFFLINE',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "VolunteerProfile_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VolunteerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VolunteerProfile_userId_key" ON "VolunteerProfile"("userId");
CREATE INDEX "VolunteerProfile_verificationStatus_availability_idx" ON "VolunteerProfile"("verificationStatus", "availability");

CREATE TABLE "VolunteerTask" (
 "id" TEXT NOT NULL, "title" VARCHAR(160) NOT NULL, "description" VARCHAR(4000) NOT NULL, "location" VARCHAR(200) NOT NULL,
 "requiredSkills" TEXT[] NOT NULL, "requiresVerification" BOOLEAN NOT NULL DEFAULT true, "capacity" INTEGER NOT NULL DEFAULT 1,
 "status" "VolunteerTaskStatus" NOT NULL DEFAULT 'OPEN', "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "VolunteerTask_pkey" PRIMARY KEY ("id"), CONSTRAINT "VolunteerTask_capacity_check" CHECK ("capacity" BETWEEN 1 AND 200),
 CONSTRAINT "VolunteerTask_dates_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt")
);
CREATE INDEX "VolunteerTask_status_createdAt_idx" ON "VolunteerTask"("status", "createdAt");

CREATE TABLE "VolunteerAssignment" (
 "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "volunteerId" TEXT NOT NULL,
 "status" "VolunteerAssignmentStatus" NOT NULL DEFAULT 'OFFERED', "progress" INTEGER NOT NULL DEFAULT 0,
 "progressNotes" VARCHAR(2000) NOT NULL DEFAULT '', "completionSummary" VARCHAR(4000), "submittedHours" DOUBLE PRECISION,
 "verifiedHours" DOUBLE PRECISION NOT NULL DEFAULT 0, "reviewNote" VARCHAR(2000), "assignedBy" TEXT, "reviewedBy" TEXT,
 "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "acceptedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
 "reviewedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VolunteerAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "VolunteerTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "VolunteerAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "VolunteerAssignment_progress_check" CHECK ("progress" BETWEEN 0 AND 100),
 CONSTRAINT "VolunteerAssignment_hours_check" CHECK ("submittedHours" IS NULL OR "submittedHours" BETWEEN 0.25 AND 24),
 CONSTRAINT "VolunteerAssignment_verified_hours_check" CHECK ("verifiedHours" >= 0 AND ("status" = 'COMPLETED' OR "verifiedHours" = 0))
);
CREATE UNIQUE INDEX "VolunteerAssignment_taskId_volunteerId_key" ON "VolunteerAssignment"("taskId", "volunteerId");
CREATE INDEX "VolunteerAssignment_volunteerId_status_idx" ON "VolunteerAssignment"("volunteerId", "status");

CREATE TABLE "VolunteerShift" (
 "id" TEXT NOT NULL, "volunteerId" TEXT NOT NULL, "title" VARCHAR(160) NOT NULL, "location" VARCHAR(200) NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "VolunteerShift_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VolunteerShift_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "VolunteerShift_dates_check" CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "VolunteerShift_volunteerId_startsAt_idx" ON "VolunteerShift"("volunteerId", "startsAt");

CREATE TABLE "VolunteerCheckIn" (
 "id" TEXT NOT NULL, "volunteerId" TEXT NOT NULL, "status" "VolunteerCheckInStatus" NOT NULL,
 "notes" VARCHAR(2000) NOT NULL DEFAULT '', "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "VolunteerCheckIn_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VolunteerCheckIn_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "VolunteerCheckIn_location_check" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
);
CREATE INDEX "VolunteerCheckIn_volunteerId_createdAt_idx" ON "VolunteerCheckIn"("volunteerId", "createdAt");
