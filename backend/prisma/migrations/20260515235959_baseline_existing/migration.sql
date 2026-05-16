-- CreateEnum
CREATE TYPE "AuditJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditMode" AS ENUM ('OPENSCAP_ONLY', 'SCRIPTS_ONLY', 'OPENSCAP_AND_SCRIPTS');

-- CreateEnum
CREATE TYPE "AuditResultStatus" AS ENUM ('PASS', 'FAIL', 'NOT_APPLICABLE', 'ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "VmStatus" AS ENUM ('PROVISIONING', 'RUNNING', 'STOPPED', 'DESTROYING', 'DESTROYED', 'ERROR');

-- CreateTable
CREATE TABLE "AuditEvidence" (
    "id" SERIAL NOT NULL,
    "auditJobId" INTEGER NOT NULL,
    "vmId" INTEGER,
    "ownerSection" TEXT NOT NULL DEFAULT 'M1',
    "artifactType" TEXT NOT NULL,
    "artifactName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditJob" (
    "id" SERIAL NOT NULL,
    "vmId" INTEGER NOT NULL,
    "mode" "AuditMode" NOT NULL DEFAULT 'SCRIPTS_ONLY',
    "status" "AuditJobStatus" NOT NULL DEFAULT 'PENDING',
    "ownerSection" TEXT NOT NULL DEFAULT 'M1',
    "totalControls" INTEGER NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "summaryJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "triggeredById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executionLog" TEXT,

    CONSTRAINT "AuditJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPack" (
    "id" SERIAL NOT NULL,
    "packId" TEXT NOT NULL,
    "ownerSection" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "benchmarkName" TEXT NOT NULL DEFAULT 'CIS AlmaLinux OS 9 Benchmark',
    "benchmarkVersion" TEXT NOT NULL DEFAULT '2.0.0',
    "profile" TEXT NOT NULL DEFAULT 'Level 1 - Server',
    "sections" TEXT[],
    "runtimeType" TEXT NOT NULL DEFAULT 'shell',
    "outputMode" TEXT NOT NULL DEFAULT 'cis_stdout',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditScript" (
    "id" SERIAL NOT NULL,
    "packId" INTEGER NOT NULL,
    "controlId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "parserMode" TEXT NOT NULL DEFAULT 'cis_stdout',
    "scriptStoragePath" TEXT NOT NULL,
    "scriptSha256" TEXT,
    "risk" TEXT NOT NULL DEFAULT 'medium',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditScriptRun" (
    "id" SERIAL NOT NULL,
    "auditJobId" INTEGER NOT NULL,
    "scriptId" INTEGER NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" "AuditResultStatus" NOT NULL DEFAULT 'UNKNOWN',
    "exitCode" INTEGER,
    "stdoutRef" TEXT,
    "stderrRef" TEXT,
    "normalizedResultJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "AuditScriptRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "currentStorageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "wordCount" INTEGER,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "versionLabel" TEXT,
    "fileSize" INTEGER,
    "editedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabVm" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "gcpInstanceName" TEXT,
    "gcpZone" TEXT,
    "publicIp" TEXT,
    "machineType" TEXT NOT NULL DEFAULT 'e2-micro',
    "osFamily" TEXT NOT NULL DEFAULT 'almalinux-9',
    "diskSizeGb" INTEGER NOT NULL DEFAULT 20,
    "status" "VmStatus" NOT NULL DEFAULT 'PROVISIONING',
    "verificationToken" TEXT,
    "autoStopAt" TIMESTAMP(3),
    "terraformState" TEXT,
    "errorMessage" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gcpProjectId" TEXT,
    "latestRunUrl" TEXT,

    CONSTRAINT "LabVm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" SERIAL NOT NULL,
    "reportBuildId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "githubReleaseUrl" TEXT,
    "checksum" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportBuild" (
    "id" SERIAL NOT NULL,
    "buildType" TEXT NOT NULL,
    "storageKeyDocx" TEXT,
    "storageKeyPdf" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "buildLog" TEXT,
    "triggeredById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "restartCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptValidation" (
    "id" SERIAL NOT NULL,
    "scriptId" INTEGER NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "warningsJson" JSONB,
    "errorsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cisChapters" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionAssignment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "githubId" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditPack_packId_key" ON "AuditPack"("packId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AuditScript_packId_controlId_key" ON "AuditScript"("packId" ASC, "controlId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Document_sectionId_key" ON "Document"("sectionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LabVm_name_key" ON "LabVm"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Release_reportBuildId_key" ON "Release"("reportBuildId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Section_code_key" ON "Section"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SectionAssignment_userId_sectionId_key" ON "SectionAssignment"("userId" ASC, "sectionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubUsername_key" ON "User"("githubUsername" ASC);

-- AddForeignKey
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditJob" ADD CONSTRAINT "AuditJob_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditJob" ADD CONSTRAINT "AuditJob_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "LabVm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScript" ADD CONSTRAINT "AuditScript_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScript" ADD CONSTRAINT "AuditScript_packId_fkey" FOREIGN KEY ("packId") REFERENCES "AuditPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScriptRun" ADD CONSTRAINT "AuditScriptRun_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditScriptRun" ADD CONSTRAINT "AuditScriptRun_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "AuditScript"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabVm" ADD CONSTRAINT "LabVm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_reportBuildId_fkey" FOREIGN KEY ("reportBuildId") REFERENCES "ReportBuild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportBuild" ADD CONSTRAINT "ReportBuild_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptValidation" ADD CONSTRAINT "ScriptValidation_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "AuditScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionAssignment" ADD CONSTRAINT "SectionAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionAssignment" ADD CONSTRAINT "SectionAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
