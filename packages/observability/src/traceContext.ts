import { randomBytes } from "crypto";

export interface TraceContext {
  requestId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  operationId?: string;
  idempotencyKey?: string;
  appVersion: string;
  gitSha?: string;
  cloudRunRevision?: string;
  environment: string;
}

export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

export function createTraceContext(partial: Partial<TraceContext>): TraceContext {
  return {
    requestId: partial.requestId || randomBytes(12).toString("hex"),
    traceId: partial.traceId || generateTraceId(),
    spanId: partial.spanId || generateSpanId(),
    parentSpanId: partial.parentSpanId,
    tenantId: partial.tenantId,
    branchId: partial.branchId,
    userId: partial.userId,
    deviceId: partial.deviceId,
    sessionId: partial.sessionId,
    operationId: partial.operationId,
    idempotencyKey: partial.idempotencyKey,
    appVersion: partial.appVersion || "2.0.0",
    gitSha: partial.gitSha,
    cloudRunRevision: partial.cloudRunRevision,
    environment: partial.environment || process.env.NODE_ENV || "production",
  };
}

const REDACTED_KEYS = new Set([
  "password",
  "passhash",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "jwt_secret",
  "authorization",
  "cookie",
  "creditcard",
  "cardnumber",
  "cvv",
  "pan",
  "apikey",
  "privatekey",
]);

export function sanitizeTelemetryData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeTelemetryData(item)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (REDACTED_KEYS.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeTelemetryData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}