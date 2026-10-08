import type { FastifyRequest } from "fastify";
import { verifyStepUpToken } from "./superAdminSecurityService.js";
import type { TenantContext } from "@kwakopos2/contracts";

export class StepUpGuardError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = "STEP_UP_REQUIRED") {
    super(message);
    this.name = "StepUpGuardError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function requireStepUpToken(req: FastifyRequest, ctx: TenantContext, expectedAction: string): void {
  const enforced = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification";
  if (!enforced) return;

  const token = String(req.headers["x-step-up-token"] || (req.body as any)?.stepUpToken || "").trim();
  if (!token) {
    throw new StepUpGuardError("Step-up authentication is required before this destructive operation.");
  }

  let verified: { userId: string; action: string };
  try {
    verified = verifyStepUpToken(token, expectedAction);
  } catch {
    throw new StepUpGuardError("Invalid or expired step-up authentication token.");
  }

  if (String(verified.userId) !== String(ctx.userId)) {
    throw new StepUpGuardError(
      "Step-up identity does not match the authenticated operator.",
      403,
      "STEP_UP_IDENTITY_MISMATCH"
    );
  }
}
