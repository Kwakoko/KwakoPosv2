import { createHash, randomUUID } from "crypto";
import type {
  LegalDocument,
  LegalDocumentVersion,
  LegalAcceptanceRecord,
  SubmitAcceptanceRequest,
  DataSubjectRequest,
  DsrType,
  DsrStatus,
  DataExportJob,
  LegalHold,
  RetentionPolicy,
  RetentionExecution,
  SecurityPrivacyIncident,
  IncidentSeverity,
  IncidentStatus,
  Subprocessor,
  OssLicenseNotice,
  LegalGovernanceOverview,
} from "@kwakopos2/contracts";

// ============================================================
// KWAKOPOS V2 — LEGAL, PRIVACY & GOVERNANCE DOMAIN ENGINE
// ============================================================

export class LegalGovernanceEngine {
  /**
   * Computes deterministic SHA-256 hash of legal document version content.
   */
  public static computeDocumentHash(documentId: string, version: string, language: string, content: string): string {
    const raw = `DOC:${documentId}:VER:${version}:LANG:${language}:BODY:${content.trim()}`;
    return createHash("sha256").update(raw, "utf8").digest("hex");
  }

  /**
   * Computes immutable evidence hash of user acceptance.
   */
  public static computeAcceptanceEvidenceHash(params: {
    userId: string;
    tenantId: string;
    documentId: string;
    documentVersion: string;
    language: string;
    acceptedAt: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    sessionDeviceRef?: string | null;
    documentHash: string;
  }): string {
    const payload = JSON.stringify({
      userId: params.userId,
      tenantId: params.tenantId,
      documentId: params.documentId,
      version: params.documentVersion,
      lang: params.language,
      ts: params.acceptedAt,
      ip: params.ipAddress || "UNKNOWN",
      ua: params.userAgent || "UNKNOWN",
      dev: params.sessionDeviceRef || "NONE",
      docHash: params.documentHash,
    });
    return createHash("sha256").update(payload, "utf8").digest("hex");
  }

  /**
   * Verifies document cryptographic integrity.
   */
  public static verifyDocumentIntegrity(version: LegalDocumentVersion): boolean {
    const expected = this.computeDocumentHash(version.documentId, version.version, version.language, version.content);
    return expected === version.cryptographicIntegrityHash;
  }

  /**
   * Evaluates whether a user or tenant has mandatory pending legal acceptances.
   */
  public static evaluatePendingAcceptances(
    publishedDocuments: Array<{ document: LegalDocument; activeVersion: LegalDocumentVersion }>,
    userAcceptances: LegalAcceptanceRecord[]
  ): {
    isCompliant: boolean;
    requiredDocuments: Array<{
      documentId: string;
      documentType: string;
      title: string;
      requiredVersion: string;
      reason: "FIRST_TIME" | "MATERIAL_UPDATE";
    }>;
  } {
    const required: Array<{
      documentId: string;
      documentType: string;
      title: string;
      requiredVersion: string;
      reason: "FIRST_TIME" | "MATERIAL_UPDATE";
    }> = [];

    for (const { document, activeVersion } of publishedDocuments) {
      if (!document.isMandatory && !activeVersion.isMandatoryAcceptance) continue;

      // Find user's latest valid acceptance for this document
      const matchingAcceptances = userAcceptances
        .filter((a) => a.documentId === document.id && a.consentStatus === "ACCEPTED")
        .sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());

      if (matchingAcceptances.length === 0) {
        required.push({
          documentId: document.id,
          documentType: document.documentType,
          title: activeVersion.title,
          requiredVersion: activeVersion.version,
          reason: "FIRST_TIME",
        });
      } else {
        const latestAcceptance = matchingAcceptances[0];
        if (latestAcceptance.documentVersion !== activeVersion.version) {
          required.push({
            documentId: document.id,
            documentType: document.documentType,
            title: activeVersion.title,
            requiredVersion: activeVersion.version,
            reason: "MATERIAL_UPDATE",
          });
        }
      }
    }

    return {
      isCompliant: required.length === 0,
      requiredDocuments: required,
    };
  }

  /**
   * Sanitizes exported data objects by scrubbing sensitive tokens, password hashes, and secrets.
   */
  public static sanitizeExportData(data: Record<string, any>): Record<string, any> {
    const sensitiveKeys = new Set([
      "passwordHash",
      "password_hash",
      "password",
      "secret",
      "secretKey",
      "secret_key",
      "apiKey",
      "api_key",
      "refreshToken",
      "refresh_token",
      "jwt",
      "token",
      "internalSalt",
      "encryptionKey",
      "privateKey",
      "superAdminToken",
    ]);

    const sanitizeValue = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return val.map(sanitizeValue);
      if (typeof val === "object" && !(val instanceof Date)) {
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          if (sensitiveKeys.has(k) || k.toLowerCase().includes("password") || k.toLowerCase().includes("secret")) {
            clean[k] = "[REDACTED_FOR_PRIVACY]";
          } else {
            clean[k] = sanitizeValue(v);
          }
        }
        return clean;
      }
      return val;
    };

    return sanitizeValue(data);
  }

  /**
   * Anonymizes a user or customer profile while preserving operational integrity.
   */
  public static anonymizeProfile(profile: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }): {
    name: string;
    email: string;
    phone: string;
    address: string;
    notes: string;
    isAnonymized: true;
    anonymizedAt: string;
  } {
    const hash = createHash("sha256").update(profile.id).digest("hex").slice(0, 8).toUpperCase();
    return {
      name: `[ANONYMIZED_USER_${hash}]`,
      email: `anonymized-${hash.toLowerCase()}@privacy.kwakopos.local`,
      phone: "[REDACTED]",
      address: "[REDACTED]",
      notes: "Identity anonymized pursuant to Data Subject Erasure request and PDPA/GDPR compliance.",
      isAnonymized: true,
      anonymizedAt: new Date().toISOString(),
    };
  }

  /**
   * Checks if an entity is currently under an active Legal Hold.
   */
  public static isEntityUnderLegalHold(holds: LegalHold[], entityType: string, entityId: string): boolean {
    return holds.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.targetEntityType === entityType &&
        (h.targetEntityId === "*" || h.targetEntityId === entityId)
    );
  }

  /**
   * AI Privacy Guard: Scans and sanitizes prompts before AI assistant processing.
   * Enforces data classification and redacts sensitive payment, credential, or confidential data.
   */
  public static guardAiPrompt(prompt: string): {
    sanitizedPrompt: string;
    wasSanitized: boolean;
    redactionsCount: number;
    blocked: boolean;
    reason?: string;
  } {
    let sanitized = prompt;
    let redactions = 0;

    // Detect credit card numbers (13 to 19 digits)
    const ccRegex = /\b(?:\d[ -]*?){13,19}\b/g;
    if (ccRegex.test(sanitized)) {
      sanitized = sanitized.replace(ccRegex, "[REDACTED_PAYMENT_CARD]");
      redactions++;
    }

    // Detect API keys or JWT tokens
    const jwtRegex = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
    if (jwtRegex.test(sanitized)) {
      sanitized = sanitized.replace(jwtRegex, "[REDACTED_SECURITY_TOKEN]");
      redactions++;
    }

    // Detect passwords in prompt
    const passRegex = /(?:password|secret|pwd)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi;
    if (passRegex.test(sanitized)) {
      sanitized = sanitized.replace(passRegex, "password: [REDACTED_CREDENTIAL]");
      redactions++;
    }

    // Check for explicit prompt injection or bypass attempts
    const forbiddenPatterns = [
      "bypass tenant isolation",
      "dump all tenants",
      "ignore multi-tenant rules",
      "reveal database credentials",
    ];

    for (const pat of forbiddenPatterns) {
      if (prompt.toLowerCase().includes(pat)) {
        return {
          sanitizedPrompt: "",
          wasSanitized: true,
          redactionsCount: redactions,
          blocked: true,
          reason: `Prompt contains forbidden security-sensitive directive: "${pat}"`,
        };
      }
    }

    return {
      sanitizedPrompt: sanitized,
      wasSanitized: redactions > 0,
      redactionsCount: redactions,
      blocked: false,
    };
  }

  /**
   * Generates third-party open source software attribution notices.
   */
  public static generateOssAttribution(notices: OssLicenseNotice[]): string {
    const lines: string[] = [
      "# Third-Party Open Source Software & Licenses Notice",
      "",
      "KwakoPos / Kwakoko Business Operating System incorporates open source software components.",
      "Below is the complete inventory of licenses, attributions, and copyright notices.",
      "",
      "---",
      "",
    ];

    for (const n of notices) {
      lines.push(`### ${n.packageName} (v${n.version})`);
      lines.push(`- **License**: ${n.license}`);
      lines.push(`- **Copyright**: ${n.copyright}`);
      lines.push(`- **Repository**: [${n.repositoryUrl}](${n.repositoryUrl})`);
      lines.push(`- **Notice**: ${n.noticeRequirement}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
