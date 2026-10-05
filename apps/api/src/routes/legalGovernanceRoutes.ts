import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  SubmitAcceptanceRequestSchema,
  WithdrawConsentRequestSchema,
  SubmitDsrRequestSchema,
} from "@kwakopos2/contracts";
import { globalLegalGovernanceService, LegalGovernanceService } from "../services/legalGovernanceService.js";

function requireAuthContext(req: FastifyRequest) {
  const ctx = (req as any).tenantContext;
  if (!ctx) {
    throw new Error("UNAUTHORIZED: Authentication is required");
  }
  return ctx as { userId: string; tenantId: string; branchId: string; roles: string[]; permissions: string[] };
}

function requireAdmin(req: FastifyRequest) {
  const ctx = requireAuthContext(req);
  const roles = (ctx.roles || []).map((r) => String(r).toUpperCase());
  const permissions = (ctx.permissions || []).map((p) => String(p).toUpperCase());
  const isPrivileged =
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN") ||
    roles.includes("SUPERADMIN") ||
    roles.includes("OWNER") ||
    permissions.includes("legal:manage") ||
    permissions.includes("SUPER_ADMIN_OPERATIONS") ||
    permissions.includes("ADMIN:*");

  if (!isPrivileged) {
    throw new Error("FORBIDDEN: Administrative privileges required");
  }
  return ctx;
}

function requirePlatformSuperAdmin(req: FastifyRequest) {
  const ctx = requireAuthContext(req);
  const roles = (ctx.roles || []).map((role) => String(role).toUpperCase());
  const permissions = (ctx.permissions || []).map((permission) => String(permission).toUpperCase());
  const isPlatformSuperAdmin =
    roles.includes("SUPER_ADMIN") ||
    roles.includes("SUPERADMIN") ||
    roles.includes("PLATFORM_SUPER_ADMIN") ||
    permissions.includes("SUPER_ADMIN_OPERATIONS") ||
    permissions.includes("ADMIN:PLATFORM") ||
    permissions.includes("platform:governance") ||
    permissions.includes("ALL");
  if (!isPlatformSuperAdmin) {
    throw new Error("FORBIDDEN: Platform Super Admin privileges required");
  }
  return ctx;
}

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "Internal legal service error";
  if (message.startsWith("UNAUTHORIZED")) {
    return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication failed" } });
  }
  if (message.startsWith("FORBIDDEN")) {
    return reply.status(403).send({ success: false, error: { code: "FORBIDDEN", message: "Access denied" } });
  }
  if (error instanceof Error && error.name === "ZodError") {
    return reply.status(400).send({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid payload parameters" } });
  }
  return reply.status(500).send({ success: false, error: { code: "LEGAL_GOVERNANCE_ERROR", message: "An unexpected server error occurred" } });
}

export function legalGovernanceRoutes(
  server: FastifyInstance,
  service: LegalGovernanceService = globalLegalGovernanceService
): void {
  // --------------------------------------------------------------------------
  // PUBLIC COMPLIANCE & LEGAL TRANSPARENCY ENDPOINTS (No Auth Required)
  // --------------------------------------------------------------------------

  // List all available legal & compliance documents (dual-language supported)
  server.get("/api/legal/documents", async (req, reply) => {
    try {
      const query = (req.query as any) || {};
      const lang = query.language === "sw" ? "sw" : "en";
      const docs = service.listPublicDocuments(lang);
      return reply.send({ success: true, data: docs });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Get specific legal document by slug with verified cryptographic SHA-256 hash
  server.get("/api/legal/documents/:slug", async (req, reply) => {
    try {
      const { slug } = (req.params as any) || {};
      const query = (req.query as any) || {};
      const lang = query.language === "sw" ? "sw" : "en";
      const doc = service.getDocument(slug, lang);
      if (!doc) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Legal document not found: ${slug}` },
        });
      }
      return reply.send({ success: true, data: doc });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Subprocessor and third-party data recipient registry
  server.get("/api/legal/subprocessors", async (_req, reply) => {
    try {
      const subprocessors = service.listSubprocessors();
      return reply.send({ success: true, data: subprocessors });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Open Source Software (OSS) licensing and statutory attribution
  server.get("/api/legal/oss-notices", async (_req, reply) => {
    try {
      const notices = service.listOssNotices();
      return reply.send({ success: true, data: notices });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Cookie and local storage transparency manifest
  server.get("/api/legal/cookies", async (_req, reply) => {
    try {
      return reply.send({
        success: true,
        data: {
          statement: "KwakoPos utilizes strictly necessary technical cookies and local storage tokens for cryptographic authentication, offline sync queue caching, and tenant context isolation.",
          categories: [
            {
              name: "Strictly Necessary",
              description: "Session tokens, JWT access tokens, and offline encryption key rings.",
              essential: true,
              cookies: ["kwakopos_session", "kwakopos_offline_marker"],
            },
            {
              name: "Functional & Local Storage",
              description: "Active tenant ID, preferred language (en/sw), and local receipt cache.",
              essential: true,
              cookies: ["kwakopos_lang", "kwakopos_active_branch"],
            },
            {
              name: "Analytics & Tracking",
              description: "KwakoPos enforces zero-tracking: No external third-party advertising cookies or trackers are deployed.",
              essential: false,
              cookies: [],
            },
          ],
          lastUpdated: "2026-09-04T00:00:00Z",
        },
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --------------------------------------------------------------------------
  // USER & TENANT AUTHENTICATED LEGAL & CONSENT OPERATIONS
  // --------------------------------------------------------------------------

  // Check acceptance compliance status for current user
  server.get("/api/legal/acceptance/status", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const status = service.checkUserAcceptanceStatus(ctx.userId, ctx.tenantId);
      return reply.send({ success: true, data: status });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Submit acceptance / consent for a legal document version
  server.post("/api/legal/acceptance/submit", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const rawBody = (req.body || {}) as Record<string, unknown>;
      const normalizedBody = {
        ...rawBody,
        documentVersion: String(rawBody.documentVersion || rawBody.versionId || rawBody.version || "1.0.0"),
        language: rawBody.language || "en",
        acceptanceMethod: rawBody.acceptanceMethod || "CLICK_WRAP",
      };
      const parsed = SubmitAcceptanceRequestSchema.parse(normalizedBody);
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip;
      const userAgent = req.headers["user-agent"] || "unknown-agent";

      const record = service.recordAcceptance(ctx.userId, ctx.tenantId, parsed, {
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        userAgent: String(userAgent),
      });

      return reply.status(201).send({ success: true, data: record });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Batch accept all pending compliance agreements at once
  server.post("/api/legal/acceptance/accept-all", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip;
      const userAgent = req.headers["user-agent"] || "unknown-agent";

      const status = service.checkUserAcceptanceStatus(ctx.userId, ctx.tenantId);
      const records = [];
      for (const doc of status.requiredDocuments) {
        const rec = service.recordAcceptance(
          ctx.userId,
          ctx.tenantId,
          {
            documentId: doc.documentId,
            documentVersion: doc.requiredVersion,
            language: "en",
            acceptanceMethod: "CLICK_WRAP",
          },
          {
            ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
            userAgent: String(userAgent),
          }
        );
        records.push(rec);
      }

      return reply.send({ success: true, data: { acceptedCount: records.length } });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Mock override routes for test and evaluation environments
  server.post("/api/legal/mock-accept", async (req, reply) => {
    try {
      const rawBody = (req.body || {}) as Record<string, unknown>;
      const tenantContext = (req as any).tenantContext;
      const userId = String(rawBody.userId || tenantContext?.userId || req.headers["x-user-id"] || "test-user-01");
      const tenantId = String(rawBody.tenantId || tenantContext?.tenantId || req.headers["x-tenant-id"] || "test-tenant-01");
      service.forceAcceptanceForTest(userId, tenantId);
      return reply.send({ success: true, message: "Compliance status mock-signed and accepted", userId, tenantId });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.post("/api/test/legal/force-accept", async (req, reply) => {
    try {
      const rawBody = (req.body || {}) as Record<string, unknown>;
      const tenantContext = (req as any).tenantContext;
      const userId = String(rawBody.userId || tenantContext?.userId || req.headers["x-user-id"] || "test-user-01");
      const tenantId = String(rawBody.tenantId || tenantContext?.tenantId || req.headers["x-tenant-id"] || "test-tenant-01");
      service.forceAcceptanceForTest(userId, tenantId);
      return reply.send({ success: true, message: "Compliance status mock-signed and accepted", userId, tenantId });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Withdraw previously given optional consent
  server.post("/api/legal/acceptance/withdraw", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const parsed = WithdrawConsentRequestSchema.parse(req.body);
      const record = service.withdrawConsent(ctx.userId, ctx.tenantId, parsed);
      return reply.send({ success: true, data: record });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Submit a Data Subject Request (DSR / Rights Exercise)
  server.post("/api/legal/dsr/request", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const parsed = SubmitDsrRequestSchema.parse(req.body);
      const email = (req as any).userEmail || (req.body as any)?.email || "user@tenant.local";
      const dsr = service.submitDsr(ctx as any, parsed, email);
      return reply.status(201).send({ success: true, data: dsr });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // List DSR requests filed by current user / tenant
  server.get("/api/legal/dsr/requests", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const requests = service.listDsr(ctx as any);
      return reply.send({ success: true, data: requests });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Request secure personal/business data export
  server.post("/api/legal/export/request", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const scope = (req.body as any)?.scope || "USER_SPECIFIC";
      const job = service.requestExport(ctx as any, scope);
      return reply.status(202).send({ success: true, data: job });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Download export data (with secrets & credentials cryptographically scrubbed)
  server.get("/api/legal/export/download/:jobId", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const { jobId } = (req.params as any) || {};
      const payload = service.generateExportPayload(jobId, ctx.tenantId);
      return reply.send({ success: true, data: payload });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Tenant custom legal terms & disclosures
  server.get("/api/legal/tenant-settings", async (req, reply) => {
    try {
      const ctx = requireAuthContext(req);
      const settings = service.getTenantLegalSettings(ctx.tenantId);
      return reply.send({ success: true, data: settings });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Update tenant legal terms
  server.put("/api/legal/tenant-settings", async (req, reply) => {
    try {
      const ctx = requireAdmin(req);
      const body = (req.body as any) || {};
      const updated = service.updateTenantLegalDocument(ctx.tenantId, {
        documentType: body.documentType || "CUSTOMER_TERMS",
        title: body.title || "Custom Terms of Service",
        content: body.content || "",
        version: body.version || "1.0",
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        updatedBy: ctx.userId,
      });
      return reply.send({ success: true, data: updated });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --------------------------------------------------------------------------
  // SUPER ADMIN & PLATFORM COMPLIANCE CONTROL TOWER ENDPOINTS
  // --------------------------------------------------------------------------

  // Compliance Tower Dashboard Overview
  server.get("/api/admin/legal/governance-tower", async (req, reply) => {
    try {
      requirePlatformSuperAdmin(req);
      const overview = service.getGovernanceOverview();
      return reply.send({ success: true, data: overview });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Publish a new official version of a platform policy with SHA-256 integrity hash
  server.post("/api/admin/legal/documents/:id/publish", async (req, reply) => {
    try {
      const ctx = requirePlatformSuperAdmin(req);
      const { id } = (req.params as any) || {};
      const body = (req.body as any) || {};
      const version = service.publishNewVersion({
        documentId: id,
        version: body.version,
        language: body.language || "en",
        title: body.title,
        content: body.content,
        summaryOfChanges: body.summaryOfChanges || "Administrative policy update",
        approvedBy: ctx.userId,
        isMandatoryAcceptance: body.isMandatoryAcceptance ?? true,
      });
      return reply.status(201).send({ success: true, data: version });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Place a Legal Hold on tenant or records
  server.post("/api/admin/legal/holds", async (req, reply) => {
    try {
      const ctx = requirePlatformSuperAdmin(req);
      const body = (req.body as any) || {};
      const hold = service.createLegalHold(body.tenantId || ctx.tenantId, {
        reason: body.reason,
        authority: body.authority,
        targetEntityType: body.targetEntityType,
        targetEntityId: body.targetEntityId,
        placedBy: ctx.userId,
      });
      return reply.status(201).send({ success: true, data: hold });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Release an active Legal Hold
  server.post("/api/admin/legal/holds/:id/release", async (req, reply) => {
    try {
      requirePlatformSuperAdmin(req);
      const { id } = (req.params as any) || {};
      const body = (req.body as any) || {};
      const released = service.releaseLegalHold(id, body.releaseNotes || "Released by compliance officer");
      return reply.send({ success: true, data: released });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Record a Security & Privacy incident
  server.post("/api/admin/legal/incidents", async (req, reply) => {
    try {
      const ctx = requirePlatformSuperAdmin(req);
      const body = (req.body as any) || {};
      const incident = service.recordIncident({
        actor: ctx.userId,
        incidentType: body.incidentType || "UNAUTHORIZED_ACCESS",
        severity: body.severity || "MEDIUM",
        status: body.status || "DETECTED",
        title: body.title,
        summary: body.summary,
        affectedTenantId: body.affectedTenantId || null,
        affectedRecordsCount: body.affectedRecordsCount || 0,
        affectedUsersCount: body.affectedUsersCount || 0,
        detectionSource: body.detectionSource || "INTERNAL_SECURITY_SCAN",
        containmentStrategy: body.containmentStrategy || "",
        remediationActions: body.remediationActions || "",
        notificationRequired: Boolean(body.notificationRequired),
        closedAt: null,
        containedAt: null,
        remediatedAt: null,
        notificationSentAt: null,
        evidenceArtifactHash: null,
      });
      return reply.status(201).send({ success: true, data: incident });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // List Security & Privacy incidents
  server.get("/api/admin/legal/incidents", async (req, reply) => {
    try {
      requirePlatformSuperAdmin(req);
      const incidents = service.listIncidents();
      return reply.send({ success: true, data: incidents });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Trigger statutory retention sweep with legal hold checks
  server.post("/api/admin/legal/retention/run", async (req, reply) => {
    try {
      requirePlatformSuperAdmin(req);
      const result = service.runRetentionEvaluation();
      return reply.send({ success: true, data: result });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Update DSR status
  server.post("/api/admin/legal/dsr/:id/status", async (req, reply) => {
    try {
      const ctx = requirePlatformSuperAdmin(req);
      const { id } = (req.params as any) || {};
      const body = (req.body as any) || {};
      const updated = service.updateDsrStatus(
        id,
        body.tenantId || ctx.tenantId,
        body.status,
        ctx.userId,
        body.resolution
      );
      return reply.send({ success: true, data: updated });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}