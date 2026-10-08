export const PLATFORM_SERVICES_PRODUCTION_LOCK_ID = "KWAKOPOS-PLATFORM-SERVICES-PRODUCTION-LOCK-v1" as const;

export type PlatformServiceLock = {
  id: string;
  name: string;
  authorityFiles: readonly string[];
  certificationFiles: readonly string[];
  testFiles: readonly string[];
  requiredMarkers: readonly [string, string][];
  dedicatedLock?: string;
};

export const PLATFORM_SERVICES_PRODUCTION_LOCKS: readonly PlatformServiceLock[] = [
  {
    id: "C01",
    name: "Tenant Onboarding",
    authorityFiles: [
      "packages/database/prisma/migrations/202609020001_tenant_onboarding/migration.sql",
      "packages/contracts/src/tenantOnboardingContracts.ts",
      "apps/api/src/services/tenantOnboardingService.ts",
      "apps/api/src/routes/tenantOnboardingRoutes.ts",
      "apps/web/src/pages/TenantOnboardingPage.tsx",
    ],
    certificationFiles: ["scripts/certification/runTenantOnboardingCertification.ts"],
    testFiles: ["tests/integration/tenant-onboarding.test.ts","tests/browser/tenant-onboarding.spec.ts"],
    requiredMarkers: [
      ["apps/api/src/services/tenantOnboardingService.ts", "class TenantOnboardingService"],
      ["apps/api/src/routes/tenantOnboardingRoutes.ts", "tenantOnboarding"],
      ["apps/web/src/pages/TenantOnboardingPage.tsx", "Tenant Onboarding"],
      ["tests/integration/tenant-onboarding.test.ts", "tenant"],
    ],
  },
  {
    id: "C02",
    name: "Subscription / Billing",
    authorityFiles: [
      "packages/contracts/src/monetizationContracts.ts",
      "packages/domain/src/monetizationEngine.ts",
      "packages/database/src/monetizationRepositories.ts",
      "apps/web/src/pages/AdministrationPage.tsx",
      "scripts/release/verify-commercial-product-readiness.ts",
    ],
    certificationFiles: ["tests/unit/monetization-invariants.test.ts","scripts/certification/runCertification.ts"],
    testFiles: ["tests/unit/monetization-invariants.test.ts"],
    requiredMarkers: [
      ["packages/contracts/src/monetizationContracts.ts", "SubscriptionSchema"],
      ["packages/domain/src/monetizationEngine.ts", "SubscriptionLifecycleEngine"],
      ["packages/domain/src/monetizationEngine.ts", "BillingInvoicingEngine"],
      ["packages/domain/src/monetizationEngine.ts", "SaaSPaymentEngine"],
      ["packages/database/src/monetizationRepositories.ts", "assertPaymentIdempotency"],
      ["apps/web/src/pages/AdministrationPage.tsx", "subscription"],
      ["apps/web/src/pages/AdministrationPage.tsx", "billing"],
      ["tests/unit/monetization-invariants.test.ts", "M001"],
      ["tests/unit/monetization-invariants.test.ts", "M015"],
    ],
  },
  {
    id: "C03",
    name: "Workforce",
    authorityFiles: [
      "apps/web/src/pages/ProductionStaffHRPage.tsx",
      "apps/api/src/services/workforceService.ts",
      "packages/contracts/src/workforceContracts.ts",
      "packages/domain/src/workforceTrackingEngine.ts",
      "packages/database/src/workforceRepositories.ts",
    ],
    certificationFiles: ["scripts/certification/workforce-production-lock.ts","scripts/certification/workforce-certification-engine.ts"],
    testFiles: ["tests/integration/workforce-api.test.ts","tests/unit/workforce.test.ts","tests/unit/commissions-payroll.test.ts"],
    requiredMarkers: [
      ["scripts/certification/workforce-production-lock.ts", "STAFF / HR PRODUCTION LOCK: PASS"],
      ["apps/web/src/pages/ProductionStaffHRPage.tsx", "/api/v1/workforce/employees"],
      ["apps/api/src/services/workforceService.ts", "WorkforceEmployee"],
      ["packages/contracts/src/workforceContracts.ts", "WorkforceEmployee"],
      ["tests/unit/workforce.test.ts", "Workforce"],
    ],
    dedicatedLock: "scripts/certification/workforce-production-lock.ts",
  },
  {
    id: "C04",
    name: "Notifications",
    authorityFiles: [
      "apps/api/src/services/notificationService.ts",
      "packages/database/prisma/schema.prisma",
      "apps/web/src/layouts/SystemAppShellLayout.tsx",
      "apps/web/src/uiParityMatrix.ts",
    ],
    certificationFiles: ["scripts/certification/notification-production-lock.ts","scripts/certification/runNotificationCertification.ts"],
    testFiles: ["tests/unit/notification-production-lock.test.ts"],
    requiredMarkers: [
      ["scripts/certification/notification-production-lock.ts", "KWAKOPOS-NOTIFICATIONS-PRODUCTION-LOCK-v1"],
      ["apps/api/src/services/notificationService.ts", "tx.notification.upsert"],
      ["apps/api/src/services/notificationService.ts", "retryDue"],
      ["apps/web/src/layouts/SystemAppShellLayout.tsx", "/api/v1/notifications?scope="],
      ["tests/unit/notification-production-lock.test.ts", "KWAKOPOS-NOTIFICATIONS-PRODUCTION-LOCK-v1"],
    ],
    dedicatedLock: "scripts/certification/notification-production-lock.ts",
  },
  {
    id: "C05",
    name: "Documents",
    authorityFiles: [
      "packages/contracts/src/documentContracts.ts",
      "packages/domain/src/documentEngine.ts",
      "apps/api/src/services/documentService.ts",
      "apps/web/src/documentCenter.ts",
    ],
    certificationFiles: ["scripts/certification/document-certification-engine.ts","scripts/certification/runDocumentCertification.ts"],
    testFiles: ["tests/unit/document.test.ts"],
    requiredMarkers: [
      ["packages/domain/src/documentEngine.ts", "class DocumentEngine"],
      ["apps/api/src/services/documentService.ts", "class DocumentService"],
      ["apps/api/src/services/documentService.ts", "uploadDocument"],
      ["tests/unit/document.test.ts", "Phase 40"],
    ],
  },
  {
    id: "C06",
    name: "Integrations",
    authorityFiles: [
      "packages/config/src/integrationApiEcosystemGovernance.ts",
      "packages/contracts/src/integrationContracts.ts",
      "packages/domain/src/integrationEngine.ts",
      "apps/api/src/services/integrationService.ts",
      "apps/api/src/middleware/securityMiddleware.ts",
    ],
    certificationFiles: ["scripts/certification/integration-certification-engine.ts","scripts/certification/runIntegrationCertification.ts","scripts/release/verify-integration-api-ecosystem.ts"],
    testFiles: ["tests/unit/integration.test.ts","tests/unit/enterprise-onboarding.test.ts"],
    requiredMarkers: [
      ["packages/config/src/integrationApiEcosystemGovernance.ts", "failClosed: true"],
      ["packages/config/src/integrationApiEcosystemGovernance.ts", "tenant identity"],
      ["apps/api/src/services/integrationService.ts", "class IntegrationService"],
      ["packages/domain/src/integrationEngine.ts", "receiveWebhookEvent"],
      ["tests/unit/integration.test.ts", "Phase 39"],
    ],
  },
  {
    id: "C07",
    name: "AI",
    authorityFiles: [
      "packages/config/src/aiAgentGovernance.ts",
      "packages/config/src/aiOperatingLayerGovernance.ts",
      "packages/contracts/src/aiNativeContracts.ts",
      "packages/domain/src/aiNativeEngine.ts",
      "apps/api/src/services/aiNativeService.ts",
    ],
    certificationFiles: [
      "scripts/certification/ai-native-certification-engine.ts",
      "scripts/certification/runAiNativeCertification.ts",
      "scripts/release/verify-ai-agent-governance.ts",
      "scripts/release/verify-ai-operating-layer-governance.ts",
    ],
    testFiles: ["tests/unit/ai-native.test.ts","tests/unit/ai-operating-layer.test.ts"],
    requiredMarkers: [
      ["packages/config/src/aiAgentGovernance.ts", "failClosed: true"],
      ["packages/config/src/aiAgentGovernance.ts", "AI agents MUST NOT bypass"],
      ["packages/domain/src/aiNativeEngine.ts", "class AiNativeEngine"],
      ["packages/domain/src/aiNativeEngine.ts", "killSwitch"],
      ["apps/api/src/services/aiNativeService.ts", "AiNativeEngine"],
      ["tests/unit/ai-native.test.ts", "LEVEL_4_RESTRICTED"],
    ],
  },
  {
    id: "C08",
    name: "BI / Analytics",
    authorityFiles: [
      "packages/config/src/biAnalyticsGovernance.ts",
      "packages/contracts/src/biAnalyticsContracts.ts",
      "packages/domain/src/biAnalyticsEngine.ts",
      "packages/domain/src/financialReportingEngine.ts",
    ],
    certificationFiles: ["scripts/certification/bi-analytics-certification-engine.ts","scripts/certification/runBiAnalyticsCertification.ts","scripts/release/verify-bi-analytics-governance.ts"],
    testFiles: ["tests/unit/bi-analytics.test.ts"],
    requiredMarkers: [
      ["packages/config/src/biAnalyticsGovernance.ts", "authoritative-reconciliation"],
      ["packages/config/src/biAnalyticsGovernance.ts", "tenant-isolation"],
      ["packages/domain/src/biAnalyticsEngine.ts", "class BiAnalyticsEngine"],
      ["tests/unit/bi-analytics.test.ts", "BI & Analytics"],
    ],
  },
  {
    id: "C09",
    name: "Workflow / Automation",
    authorityFiles: [
      "packages/config/src/workflowGovernance.ts",
      "packages/contracts/src/workflowAutomationContracts.ts",
      "packages/domain/src/workflowAutomationEngine.ts",
      "apps/web/src/workflowAutomationCommandCenter.ts",
    ],
    certificationFiles: ["scripts/certification/workflow-automation-certification-engine.ts","scripts/certification/runWorkflowAutomationCertification.ts","scripts/release/verify-workflow-integrity.ts"],
    testFiles: ["tests/unit/workflow-automation.test.ts"],
    requiredMarkers: [
      ["packages/config/src/workflowGovernance.ts", "explicitViolationsMustBeZero"],
      ["packages/config/src/workflowGovernance.ts", "privilegedActionsRequirePermissionBoundary"],
      ["packages/domain/src/workflowAutomationEngine.ts", "class WorkflowAutomationEngine"],
      ["tests/unit/workflow-automation.test.ts", "approval chains"],
    ],
  },
  {
    id: "C10",
    name: "Compliance",
    authorityFiles: [
      "packages/contracts/src/complianceContracts.ts",
      "packages/domain/src/complianceEngine.ts",
      "scripts/security/compliance-control-matrix.ts",
      "apps/web/src/complianceCenter.ts",
    ],
    certificationFiles: ["scripts/certification/compliance-certification-engine.ts","scripts/certification/runComplianceCertification.ts","scripts/certification/tax-fiscalization-production-lock.ts"],
    testFiles: ["tests/unit/compliance.test.ts"],
    requiredMarkers: [
      ["packages/domain/src/complianceEngine.ts", "class ComplianceEngine"],
      ["packages/domain/src/complianceEngine.ts", "verifyAuditChain"],
      ["scripts/security/compliance-control-matrix.ts", "Tanzania PDPA"],
      ["tests/unit/compliance.test.ts", "audit hash chain"],
    ],
  },
  {
    id: "C11",
    name: "Super Admin",
    authorityFiles: [
      "apps/api/src/routes/superAdminDatabaseRoutes.ts",
      "apps/api/src/services/superAdminSecurityService.ts",
      "apps/api/src/routes/tenantOnboardingRoutes.ts",
      "apps/web/src/components/SuperAdminLiveControlPlane.tsx",
    ],
    certificationFiles: ["scripts/certification/super-admin-production-lock.ts","scripts/certification/super-admin-platform-certification-engine.ts"],
    testFiles: ["tests/unit/super-admin-production-lock.test.ts"],
    requiredMarkers: [
      ["scripts/certification/super-admin-production-lock.ts", "SUPER ADMIN PRODUCTION LOCK: PASS"],
      ["apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("SUPER_ADMIN")'],
      ["apps/api/src/services/superAdminSecurityService.ts", "last_totp_counter"],
      ["apps/web/src/components/SuperAdminLiveControlPlane.tsx", "/api/v1/super-admin/security/health"],
      ["tests/unit/super-admin-production-lock.test.ts", "fail-closed"],
    ],
    dedicatedLock: "scripts/certification/super-admin-production-lock.ts",
  },
] as const;

export const PLATFORM_SERVICES_PRODUCTION_RELEASE_GATES = [
  ".github/workflows/ci.yml",
  ".github/workflows/production-certification.yml",
  ".github/workflows/production-release-exact-main.yml",
] as const;
