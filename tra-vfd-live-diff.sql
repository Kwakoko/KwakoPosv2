-- DropForeignKey
ALTER TABLE "platform_super_admin_security" DROP CONSTRAINT "platform_super_admin_security_user_id_fkey";

-- DropIndex
DROP INDEX "sync_operations_tenant_status_created_idx";

-- AlterTable
ALTER TABLE "app_versions" ALTER COLUMN "schemaVersion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "brands" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "deployment_history" ALTER COLUMN "revision" DROP NOT NULL,
ALTER COLUMN "artifactDigest" DROP NOT NULL;

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "description",
DROP COLUMN "isSystemRole";

-- AlterTable
ALTER TABLE "saas_data_records" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sync_control_state" DROP CONSTRAINT "sync_control_state_pkey",
ALTER COLUMN "id" SET DEFAULT 1,
ALTER COLUMN "id" SET DATA TYPE INTEGER,
ALTER COLUMN "sync_epoch" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "sync_control_state_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP COLUMN "phone";

-- DropTable
DROP TABLE "SupportEvent";

-- DropTable
DROP TABLE "SupportIncident";

-- DropTable
DROP TABLE "SupportIncidentTenant";

-- DropTable
DROP TABLE "SupportKnowledgeArticle";

-- DropTable
DROP TABLE "SupportRemediation";

-- DropTable
DROP TABLE "SupportTicket";

-- DropTable
DROP TABLE "auth_login_throttles";

-- DropTable
DROP TABLE "platform_super_admin_security";

-- DropTable
DROP TABLE "sync_change_journal";

-- DropTable
DROP TABLE "sync_conflict_record";

-- DropTable
DROP TABLE "tenant_configurations";

-- DropTable
DROP TABLE "tenant_module_entitlements";

-- DropTable
DROP TABLE "tenant_onboarding_audit_events";

-- DropTable
DROP TABLE "tenant_onboardings";

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "canonicalTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currentVersion" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "applicableAudiences" TEXT[] DEFAULT ARRAY['TENANT_OWNER', 'USER', 'SUPER_ADMIN', 'PUBLIC']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "language" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summaryOfChanges" TEXT NOT NULL DEFAULT 'Initial published version',
    "jurisdiction" TEXT NOT NULL DEFAULT 'Tanzania (Data Protection Act 2022) / East Africa & Global',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "supersedesVersion" TEXT,
    "isMandatoryAcceptance" BOOLEAN NOT NULL DEFAULT true,
    "cryptographicIntegrityHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptanceMethod" TEXT NOT NULL DEFAULT 'CLICK_WRAP',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionDeviceRef" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-TZ',
    "consentStatus" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "consentSource" TEXT NOT NULL DEFAULT 'KWAKOPOS_WEB_PORTAL',
    "evidenceHash" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "details" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationState" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedTo" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "exportDownloadUrl" TEXT,
    "exportExpiresAt" TIMESTAMP(3),
    "auditTrail" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'TENANT_WIDE',
    "targetId" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'JSON',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checksumSha256" TEXT,
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "downloadToken" TEXT,

    CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "targetEntityType" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "placedBy" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releaseNotes" TEXT,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_retention_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'GLOBAL',
    "dataType" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "retentionBasis" TEXT NOT NULL,
    "archivePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "deletionAction" TEXT NOT NULL DEFAULT 'ANONYMIZATION',
    "overrideByLegalHold" BOOLEAN NOT NULL DEFAULT true,
    "jurisdiction" TEXT NOT NULL DEFAULT 'TZ_EAST_AFRICA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_privacy_incidents" (
    "id" TEXT NOT NULL,
    "incidentNumber" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "affectedTenantId" TEXT,
    "affectedRecordsCount" INTEGER NOT NULL DEFAULT 0,
    "affectedUsersCount" INTEGER NOT NULL DEFAULT 0,
    "detectionSource" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containedAt" TIMESTAMP(3),
    "remediatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "containmentStrategy" TEXT NOT NULL DEFAULT '',
    "remediationActions" TEXT NOT NULL DEFAULT '',
    "notificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "notificationSentAt" TIMESTAMP(3),
    "evidenceArtifactHash" TEXT,
    "auditLog" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "security_privacy_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subprocessors" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataCategories" TEXT[],
    "dataRegion" TEXT NOT NULL,
    "dpaStatus" TEXT NOT NULL DEFAULT 'EXECUTED',
    "privacyPolicyUrl" TEXT NOT NULL,
    "securityCertifications" TEXT[] DEFAULT ARRAY['SOC 2', 'ISO 27001']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "subprocessors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_legal_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "tenant_legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tra_vfd_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "endpoint" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tra_vfd_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tra_vfd_fiscalizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "receiptId" TEXT,
    "transactionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'LOCAL_FISCAL_PENDING',
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "fiscalReceiptNumber" TEXT,
    "fiscalCode" TEXT,
    "verificationCode" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tra_vfd_fiscalizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tra_vfd_outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fiscalizationId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tra_vfd_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_slug_key" ON "legal_documents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_documentId_version_language_key" ON "legal_document_versions"("documentId", "version", "language");

-- CreateIndex
CREATE INDEX "legal_acceptances_userId_tenantId_idx" ON "legal_acceptances"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "legal_acceptances_documentId_documentVersion_idx" ON "legal_acceptances"("documentId", "documentVersion");

-- CreateIndex
CREATE INDEX "data_subject_requests_tenantId_idx" ON "data_subject_requests"("tenantId");

-- CreateIndex
CREATE INDEX "data_export_jobs_tenantId_idx" ON "data_export_jobs"("tenantId");

-- CreateIndex
CREATE INDEX "legal_holds_tenantId_idx" ON "legal_holds"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "security_privacy_incidents_incidentNumber_key" ON "security_privacy_incidents"("incidentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_legal_documents_tenantId_documentType_key" ON "tenant_legal_documents"("tenantId", "documentType");

-- CreateIndex
CREATE INDEX "tra_vfd_configs_tenantId_branchId_idx" ON "tra_vfd_configs"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "tra_vfd_configs_tenantId_branchId_key" ON "tra_vfd_configs"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "tra_vfd_fiscalizations_receiptId_key" ON "tra_vfd_fiscalizations"("receiptId");

-- CreateIndex
CREATE INDEX "tra_vfd_fiscalizations_tenantId_branchId_state_idx" ON "tra_vfd_fiscalizations"("tenantId", "branchId", "state");

-- CreateIndex
CREATE INDEX "tra_vfd_fiscalizations_tenantId_branchId_nextAttemptAt_idx" ON "tra_vfd_fiscalizations"("tenantId", "branchId", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "tra_vfd_fiscalizations_tenantId_branchId_transactionId_key" ON "tra_vfd_fiscalizations"("tenantId", "branchId", "transactionId");

-- CreateIndex
CREATE INDEX "tra_vfd_outbox_tenantId_branchId_status_idx" ON "tra_vfd_outbox"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "tra_vfd_outbox_tenantId_branchId_nextAttemptAt_idx" ON "tra_vfd_outbox"("tenantId", "branchId", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "tra_vfd_outbox_tenantId_branchId_idempotencyKey_key" ON "tra_vfd_outbox"("tenantId", "branchId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_configs" ADD CONSTRAINT "tra_vfd_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_configs" ADD CONSTRAINT "tra_vfd_configs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_fiscalizations" ADD CONSTRAINT "tra_vfd_fiscalizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_fiscalizations" ADD CONSTRAINT "tra_vfd_fiscalizations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_fiscalizations" ADD CONSTRAINT "tra_vfd_fiscalizations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_outbox" ADD CONSTRAINT "tra_vfd_outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_outbox" ADD CONSTRAINT "tra_vfd_outbox_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tra_vfd_outbox" ADD CONSTRAINT "tra_vfd_outbox_fiscalizationId_fkey" FOREIGN KEY ("fiscalizationId") REFERENCES "tra_vfd_fiscalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "stock_adjustments_tenant_branch_idempotency_uq" RENAME TO "stock_adjustments_tenantId_branchId_idempotencyKey_key";

-- RenameIndex
ALTER INDEX "stock_ledgers_tenant_branch_idempotency_uq" RENAME TO "stock_ledgers_tenantId_branchId_idempotencyKey_key";

-- RenameIndex
ALTER INDEX "sync_operations_tenant_branch_device_operation_uq" RENAME TO "sync_operations_tenantId_branchId_deviceId_operationId_key";

-- RenameIndex
ALTER INDEX "sync_operations_tenant_branch_idempotency_uq" RENAME TO "sync_operations_tenantId_branchId_idempotencyKey_key";

