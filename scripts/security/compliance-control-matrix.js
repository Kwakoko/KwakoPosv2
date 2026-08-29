export function getComplianceControlMatrix() {
    const mappings = [
        // ISO 27001 Controls
        { framework: "ISO/IEC 27001", requirementId: "A.5.15", title: "Access Control Policy", kwakoPosControlId: "KISB-RBAC-003", controlOwner: "API Security Lead", evidenceReference: "apps/api/src/server.ts", testingFrequency: "CONTINUOUS", readinessStatus: "ASSESSMENT_READY" },
        { framework: "ISO/IEC 27001", requirementId: "A.8.24", title: "Use of Cryptography", kwakoPosControlId: "KISB-CRYPTO-006", controlOwner: "DevOps Engineer", evidenceReference: "apps/web/src/indexedDb.ts", testingFrequency: "WEEKLY", readinessStatus: "ASSESSMENT_READY" },
        { framework: "ISO/IEC 27001", requirementId: "A.8.28", title: "Secure Coding Standards", kwakoPosControlId: "KISB-API-007", controlOwner: "API Tech Lead", evidenceReference: "packages/contracts/src/index.ts", testingFrequency: "CONTINUOUS", readinessStatus: "ASSESSMENT_READY" },
        { framework: "ISO/IEC 27001", requirementId: "A.8.30", title: "Outsourced Development (SBOM)", kwakoPosControlId: "KISB-SUPPLY-010", controlOwner: "DevSecOps Lead", evidenceReference: "scripts/release/sbom-generator.ts", testingFrequency: "CONTINUOUS", readinessStatus: "ASSESSMENT_READY" },
        { framework: "ISO/IEC 27001", requirementId: "A.8.16", title: "Monitoring Activities", kwakoPosControlId: "KISB-AUDIT-009", controlOwner: "Security Architect", evidenceReference: "scripts/security/audit-log-integrity-engine.ts", testingFrequency: "DAILY", readinessStatus: "ASSESSMENT_READY" },
        // SOC 2 Trust Services Criteria Controls
        { framework: "SOC 2 TSC", requirementId: "CC6.1", title: "Logical Access Security Boundaries", kwakoPosControlId: "KISB-TENANT-004", controlOwner: "Lead Architect", evidenceReference: "packages/database/src/index.ts", testingFrequency: "CONTINUOUS", readinessStatus: "ASSESSMENT_READY" },
        { framework: "SOC 2 TSC", requirementId: "CC6.6", title: "Boundary Protection & Infrastructure", kwakoPosControlId: "KISB-CRYPTO-006", controlOwner: "DevOps Engineer", evidenceReference: "apps/web/src/indexedDb.ts", testingFrequency: "WEEKLY", readinessStatus: "ASSESSMENT_READY" },
        { framework: "SOC 2 TSC", requirementId: "CC6.8", title: "Prevention of Malicious Software", kwakoPosControlId: "KISB-VULN-011", controlOwner: "SecOps Lead", evidenceReference: "scripts/security/vulnerability-management-engine.ts", testingFrequency: "DAILY", readinessStatus: "ASSESSMENT_READY" },
        { framework: "SOC 2 TSC", requirementId: "CC7.2", title: "Security Anomaly & Breach Detection", kwakoPosControlId: "KISB-IR-014", controlOwner: "Incident Response Commander", evidenceReference: "scripts/security/incident-response-runner.ts", testingFrequency: "QUARTERLY", readinessStatus: "ASSESSMENT_READY" },
        { framework: "SOC 2 TSC", requirementId: "CC8.1", title: "Change Management Verification", kwakoPosControlId: "KISB-SUPPLY-010", controlOwner: "DevSecOps Lead", evidenceReference: "scripts/release/artifact-attestor.ts", testingFrequency: "CONTINUOUS", readinessStatus: "ASSESSMENT_READY" },
        // GDPR Privacy Controls
        { framework: "GDPR", requirementId: "Art.32", title: "Security of Processing & Confidentiality", kwakoPosControlId: "KISB-TENANT-004", controlOwner: "Lead Architect", evidenceReference: "packages/database/src/index.ts", testingFrequency: "CONTINUOUS", readinessStatus: "ASSESSMENT_READY" },
        { framework: "GDPR", requirementId: "Art.17", title: "Right to Erasure ('Right to be Forgotten')", kwakoPosControlId: "KISB-PRIVACY-013", controlOwner: "DPO", evidenceReference: "packages/domain/src/commercialInvariants.ts", testingFrequency: "QUARTERLY", readinessStatus: "ASSESSMENT_READY" },
        { framework: "GDPR", requirementId: "Art.33", title: "Notification of Personal Data Breach", kwakoPosControlId: "KISB-IR-014", controlOwner: "Incident Response Commander", evidenceReference: "scripts/security/incident-response-runner.ts", testingFrequency: "QUARTERLY", readinessStatus: "ASSESSMENT_READY" },
        // Tanzania PDPA Privacy Controls
        { framework: "Tanzania PDPA", requirementId: "Sec.31", title: "Duty to Ensure Security of Personal Data", kwakoPosControlId: "KISB-CRYPTO-006", controlOwner: "DevOps Engineer", evidenceReference: "apps/web/src/indexedDb.ts", testingFrequency: "WEEKLY", readinessStatus: "ASSESSMENT_READY" },
        { framework: "Tanzania PDPA", requirementId: "Sec.35", title: "Data Protection Officer & Governance", kwakoPosControlId: "KISB-PRIVACY-013", controlOwner: "DPO", evidenceReference: "packages/domain/src/commercialInvariants.ts", testingFrequency: "QUARTERLY", readinessStatus: "ASSESSMENT_READY" },
    ];
    const frameworkCoverage = {};
    for (const m of mappings) {
        if (!frameworkCoverage[m.framework]) {
            frameworkCoverage[m.framework] = { mapped: 0, ready: 0 };
        }
        frameworkCoverage[m.framework].mapped += 1;
        if (m.readinessStatus === "ASSESSMENT_READY") {
            frameworkCoverage[m.framework].ready += 1;
        }
    }
    return {
        assessmentReadinessState: "Security Controls Implemented and Assessment-Ready",
        prohibitedClaimsNotice: "KwakoPos is security-control implemented and assessment-ready. Prohibited from asserting ISO 27001 Certified or SOC 2 Certified until formal independent audit issuance.",
        frameworkCoverage,
        mappings,
    };
}
if (process.argv[1]?.endsWith("compliance-control-matrix.ts")) {
    console.log(getComplianceControlMatrix());
}
//# sourceMappingURL=compliance-control-matrix.js.map