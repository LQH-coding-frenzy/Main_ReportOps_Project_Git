-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "Role" ADD VALUE 'ADMIN';
ALTER TYPE "Role" ADD VALUE 'AUDITOR';
ALTER TYPE "Role" ADD VALUE 'VIEWER';

-- AlterTable
ALTER TABLE "AuditJob" ADD COLUMN     "jobType" TEXT NOT NULL DEFAULT 'AUDIT';

-- AlterTable
ALTER TABLE "AuditPack" ADD COLUMN     "auditScriptPath" TEXT,
ADD COLUMN     "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manifestPath" TEXT,
ADD COLUMN     "remediationPath" TEXT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "controlIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "Section"
SET "controlIds" = ARRAY[]::TEXT[]
WHERE "controlIds" IS NULL;

ALTER TABLE "Section" ALTER COLUMN "controlIds" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roles" "Role"[] DEFAULT ARRAY['MEMBER']::"Role"[];

UPDATE "User"
SET "roles" = ARRAY["role"]::"Role"[];

ALTER TABLE "User" ALTER COLUMN "roles" SET NOT NULL;
