import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

export interface SecurityMiddlewareOptions {
  isProduction?: boolean;
}

/**
 * registerSecurityMiddleware
 *
 * Fastify plugin that registers:
 *   1. H-006 – @fastify/helmet     : Sets security response headers (CSP, HSTS, X-Frame-Options, etc.)
 *   2. H-004 – @fastify/rate-limit : Global IP/tenant rate limiting
 */
export const registerSecurityMiddleware: FastifyPluginAsync<SecurityMiddlewareOptions> = async (
  server: FastifyInstance,
  opts: SecurityMiddlewareOptions
): Promise<void> => {
  const isProduction = opts.isProduction ?? false;

  // 1. H-006: HTTP Security Headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    xFrameOptions: { action: "deny" },
    xContentTypeOptions: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false,
  });

  // 2. H-004: Rate Limiting
  await server.register(rateLimit, {
    global: true,
    max: isProduction ? 200 : 10000,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1"],
    keyGenerator: (req) => {
      const tenantId = (req as any).tenantContext?.tenantId as string | undefined;
      const ip = req.ip;
      return tenantId ? `${tenantId}:${ip}` : ip;
    },
    errorResponseBuilder: (_req, context) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Too many requests. Limit: ${context.max} per ${context.after}. Please slow down.`,
      },
    }),
  });
};
