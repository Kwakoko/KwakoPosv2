import { describe, it, expect } from "vitest";
import {
  LegalGovernanceEngine,
} from "@kwakopos2/domain";
import {
  globalLegalGovernanceRepository,
} from "@kwakopos2/database";
import type {
  LegalDocumentVersion,
  LegalHold,
  LegalAcceptanceRecord,
  LegalDocument,
  OssLicenseNotice,
} from "@kwakopos2/contracts";

describe("Legal Governance Domain Engine", () => {
  it("computes deterministic SHA-256 hashes for document versions", () => {
    const hash1 = LegalGovernanceEngine.computeDocumentHash(
      "TERMS_OF_SERVICE",
      "2.0.0",
      "en",
      "All users agree to these terms."
    );
    const hash2 = LegalGovernanceEngine.computeDocumentHash(
      "TERMS_OF_SERVICE",
      "2.0.0",
      "en",
      "All users agree to these terms."
    );
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).toBe(hash2);

    const hash3 = LegalGovernanceEngine.computeDocumentHash(
      "TERMS_OF_SERVICE",
      "2.0.0",
      "en",
      "Tampered content."
    );
    expect(hash1).not.toBe(hash3);
  });

  it("verifies document version integrity and flags tampered content", () => {
    const content = "Official KwakoPos Data Protection Policy text.";
    const hash = LegalGovernanceEngine.computeDocumentHash("doc-1", "1.0.0", "en", content);

    const validVersion: LegalDocumentVersion = {
      id: "v-1",
      documentId: "doc-1",
      version: "1.0.0",
      language: "en",
      title: "Data Protection Policy",
      content,
      summaryOfChanges: "Initial",
      cryptographicIntegrityHash: hash,
      isMandatoryAcceptance: true,
      effectiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      approvedBy: "COMPLIANCE_OFFICER",
      status: "PUBLISHED",
    };

    expect(LegalGovernanceEngine.verifyDocumentIntegrity(validVersion)).toBe(true);

    const tamperedVersion: LegalDocumentVersion = {
      ...validVersion,
      content: "Malicious altered terms secretly injected.",
    };
    expect(LegalGovernanceEngine.verifyDocumentIntegrity(tamperedVersion)).toBe(false);
  });

  it("computes immutable cryptographic evidence hashes for user acceptances", () => {
    const evidenceHash = LegalGovernanceEngine.computeAcceptanceEvidenceHash({
      userId: "user-100",
      tenantId: "tenant-200",
      documentId: "doc-terms",
      documentVersion: "2.0.0",
      language: "en",
      acceptedAt: "2026-09-04T12:00:00.000Z",
      ipAddress: "192.168.1.50",
      documentHash: "sha256:abc",
    });
    expect(evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("correctly evaluates pending acceptances for first-time onboarding and material updates", () => {
    const mockDoc: LegalDocument = {
      id: "doc-terms",
      documentType: "TERMS_OF_SERVICE",
      canonicalSlug: "terms-of-service",
      slug: "terms-of-service",
      canonicalTitle: "Terms of Service",
      description: "Terms of Service",
      category: "COMMERCIAL_TERMS",
      jurisdiction: "TANZANIA_EAST_AFRICA",
      isMandatory: true,
      requiresExplicitConsent: true,
      allowMinorConsent: false,
      currentVersion: "2.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockVersion: LegalDocumentVersion = {
      id: "v-2",
      documentId: "doc-terms",
      version: "2.0.0",
      language: "en",
      title: "Terms of Service",
      content: "Terms content",
      summaryOfChanges: "Material update",
      cryptographicIntegrityHash: "sha256:abc",
      isMandatoryAcceptance: true,
      effectiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      approvedBy: "ADMIN",
      status: "PUBLISHED",
    };

    // Case 1: No prior acceptance -> FIRST_TIME pending
    const status1 = LegalGovernanceEngine.evaluatePendingAcceptances(
      [{ document: mockDoc, activeVersion: mockVersion }],
      []
    );
    expect(status1.isCompliant).toBe(false);
    expect(status1.requiredDocuments.length).toBe(1);
    expect(status1.requiredDocuments[0].reason).toBe("FIRST_TIME");

    // Case 2: Accepted old version (1.0.0) -> MATERIAL_UPDATE pending
    const oldAcceptance: LegalAcceptanceRecord = {
      id: "acc-1",
      userId: "user-1",
      tenantId: "tenant-1",
      documentId: "doc-terms",
      documentType: "TERMS_OF_SERVICE",
      documentVersion: "1.0.0",
      language: "en",
      acceptedAt: "2025-01-01T00:00:00Z",
      acceptanceMethod: "CLICK_WRAP",
      evidenceHash: "sha256:old",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla",
      sessionDeviceRef: "browser",
      locale: "en-TZ",
      consentStatus: "ACCEPTED",
      consentSource: "KWAKOPOS_WEB_PORTAL",
      withdrawnAt: null,
      withdrawalReason: null,
    };

    const status2 = LegalGovernanceEngine.evaluatePendingAcceptances(
      [{ document: mockDoc, activeVersion: mockVersion }],
      [oldAcceptance]
    );
    expect(status2.isCompliant).toBe(false);
    expect(status2.requiredDocuments[0].reason).toBe("MATERIAL_UPDATE");

    // Case 3: Accepted current version (2.0.0) -> Compliant
    const currentAcceptance: LegalAcceptanceRecord = {
      ...oldAcceptance,
      documentVersion: "2.0.0",
    };
    const status3 = LegalGovernanceEngine.evaluatePendingAcceptances(
      [{ document: mockDoc, activeVersion: mockVersion }],
      [currentAcceptance]
    );
    expect(status3.isCompliant).toBe(true);
    expect(status3.requiredDocuments.length).toBe(0);
  });

  it("sanitizes exported data by scrubbing password hashes, secrets, and API tokens", () => {
    const rawPayload = {
      user: {
        id: "usr-1",
        email: "merchant@kwakopos.tz",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$secretHash",
        apiKey: "sk_live_998877665544332211",
        sessionToken: "jwt.secret.bearer",
        privateKey: "-----BEGIN PRIVATE KEY-----",
      },
      audit: [
        { action: "PAYMENT", token: "tok_secret_card" },
      ],
      publicNotes: "Regular business notes",
    };

    const sanitized = LegalGovernanceEngine.sanitizeExportData(rawPayload);

    expect(sanitized.user.email).toBe("merchant@kwakopos.tz");
    expect(sanitized.publicNotes).toBe("Regular business notes");
    expect(sanitized.user.passwordHash).toBe("[REDACTED_FOR_PRIVACY]");
    expect(sanitized.user.apiKey).toBe("[REDACTED_FOR_PRIVACY]");
    expect(sanitized.user.privateKey).toBe("[REDACTED_FOR_PRIVACY]");
    expect(sanitized.audit[0].token).toBe("[REDACTED_FOR_PRIVACY]");
  });

  it("anonymizes profile data according to statutory privacy erasure standards", () => {
    const profile = {
      id: "usr-123",
      name: "Baraka Juma",
      email: "baraka@example.com",
      phone: "+255712345678",
      address: "Posta, Dar es Salaam",
    };

    const anonymized = LegalGovernanceEngine.anonymizeProfile(profile);
    expect(anonymized.name).toContain("[ANONYMIZED_USER_");
    expect(anonymized.email).toContain("@privacy.kwakopos.local");
    expect(anonymized.phone).toBe("[REDACTED]");
    expect(anonymized.address).toBe("[REDACTED]");
    expect(anonymized.isAnonymized).toBe(true);
  });

  it("enforces Legal Hold protection against data deletion and retention sweeps", () => {
    const activeHolds: LegalHold[] = [
      {
        id: "hold-1",
        tenantId: "TENANT_TZ_01",
        reason: "TRA VAT Fiscal Audit 2026",
        authority: "TANZANIA_REVENUE_AUTHORITY",
        targetEntityType: "FINANCIAL_LEDGER",
        targetEntityId: "*",
        status: "ACTIVE",
        placedBy: "OFFICER_TRA_04",
        placedAt: new Date().toISOString(),
        releasedAt: null,
        releaseNotes: null,
      },
      {
        id: "hold-2",
        tenantId: "TENANT_TZ_02",
        reason: "Dispute Arbitration",
        authority: "COMMERCIAL_COURT",
        targetEntityType: "CONTRACT",
        targetEntityId: "CON-987",
        status: "ACTIVE",
        placedBy: "COURT_REGISTRAR",
        placedAt: new Date().toISOString(),
        releasedAt: null,
        releaseNotes: null,
      },
    ];

    // Wildcard hold on entity type
    expect(LegalGovernanceEngine.isEntityUnderLegalHold(activeHolds, "FINANCIAL_LEDGER", "REC-ANY")).toBe(true);

    // Specific entity hold
    expect(LegalGovernanceEngine.isEntityUnderLegalHold(activeHolds, "CONTRACT", "CON-987")).toBe(true);
    expect(LegalGovernanceEngine.isEntityUnderLegalHold(activeHolds, "CONTRACT", "CON-OTHER")).toBe(false);

    // Different entity type
    expect(LegalGovernanceEngine.isEntityUnderLegalHold(activeHolds, "CUSTOMER_FEEDBACK", "F-01")).toBe(false);
  });

  it("guards AI prompt inputs against confidential tenant and PII leakage", () => {
    const dangerousPrompt = "Summarize user password: 'supersecretpassword123' for merchant@kwakopos.tz";
    const guarded = LegalGovernanceEngine.guardAiPrompt(dangerousPrompt);

    expect(guarded.wasSanitized).toBe(true);
    expect(guarded.sanitizedPrompt).not.toContain("supersecretpassword123");
    expect(guarded.redactionsCount).toBeGreaterThan(0);

    const safePrompt = "Provide sales forecast for retail product category electronics in Dar es Salaam.";
    const safeGuarded = LegalGovernanceEngine.guardAiPrompt(safePrompt);
    expect(safeGuarded.wasSanitized).toBe(false);
  });

  it("generates compliant Open Source Software attribution notices", () => {
    const notice: OssLicenseNotice = {
      id: "oss-1",
      packageName: "fastify",
      version: "4.26.1",
      license: "MIT",
      authorOrVendor: "Fastify Contributors",
      copyright: "Copyright (c) Fastify contributors",
      repositoryUrl: "https://github.com/fastify/fastify",
      distributionScope: "SERVER_RUNTIME",
      noticeRequirement: "Include full license notice with binary distributions.",
      isActive: true,
      lastAuditedAt: new Date().toISOString(),
    };

    const attribution = LegalGovernanceEngine.generateOssAttribution([notice]);

    expect(attribution).toContain("fastify (v4.26.1)");
    expect(attribution).toContain("License**: MIT");
    expect(attribution).toContain("Fastify contributors");
  });
});

describe("Legal Governance Repository & Document Seeds", () => {
  const repo = globalLegalGovernanceRepository;

  it("seeds all 22 required legal documents in the platform registry", () => {
    const docs = repo.listDocuments();
    expect(docs.length).toBe(22);

    const slugs = docs.map((d) => d.slug);
    expect(slugs).toContain("privacy-policy");
    expect(slugs).toContain("data-protection-policy");
    expect(slugs).toContain("terms-of-service");
    expect(slugs).toContain("terms-of-use");
    expect(slugs).toContain("software-license");
    expect(slugs).toContain("cookie-policy");
    expect(slugs).toContain("data-retention-policy");
    expect(slugs).toContain("service-level-policy");
    expect(slugs).toContain("dpa");
  });

  it("provides dual-language support (English and Kiswahili) for legal documents", () => {
    const enDoc = repo.getDocumentBySlug("terms-of-service", "en");
    expect(enDoc).not.toBeNull();
    expect(enDoc?.activeVersion.language).toBe("en");
    expect(enDoc?.activeVersion.title).toContain("Terms of Service");

    const swDoc = repo.getDocumentBySlug("terms-of-service", "sw");
    expect(swDoc).not.toBeNull();
    expect(swDoc?.activeVersion.language).toBe("sw");
    expect(swDoc?.activeVersion.title).toContain("Masharti Makuu ya Huduma ya Kwakoko Business Operating System");
  });

  it("validates that all seeded documents have tamper-verified SHA-256 hashes", () => {
    const docs = repo.listDocuments();
    for (const doc of docs) {
      const en = repo.getDocumentBySlug(doc.slug, "en");
      expect(en).not.toBeNull();
      expect(LegalGovernanceEngine.verifyDocumentIntegrity(en!.activeVersion)).toBe(true);

      const sw = repo.getDocumentBySlug(doc.slug, "sw");
      expect(sw).not.toBeNull();
      expect(LegalGovernanceEngine.verifyDocumentIntegrity(sw!.activeVersion)).toBe(true);
    }
  });

  it("seeds authorized subprocessors and OSS notices", () => {
    const subprocessors = repo.listSubprocessors();
    expect(subprocessors.length).toBeGreaterThanOrEqual(5);
    const providers = subprocessors.map((s) => s.provider);
    expect(providers).toContain("Google Cloud Platform");
    expect(providers).toContain("Cloudflare");

    const oss = repo.listOssNotices();
    expect(oss.length).toBeGreaterThanOrEqual(4);
  });
});
