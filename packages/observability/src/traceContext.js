"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTraceId = generateTraceId;
exports.generateSpanId = generateSpanId;
exports.createTraceContext = createTraceContext;
exports.sanitizeTelemetryData = sanitizeTelemetryData;
const crypto_1 = require("crypto");
function generateTraceId() {
    return (0, crypto_1.randomBytes)(16).toString("hex");
}
function generateSpanId() {
    return (0, crypto_1.randomBytes)(8).toString("hex");
}
function createTraceContext(partial) {
    return {
        requestId: partial.requestId || (0, crypto_1.randomBytes)(12).toString("hex"),
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
        appVersion: partial.appVersion || "2.1.0",
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
function sanitizeTelemetryData(data) {
    if (data === null || data === undefined)
        return data;
    if (typeof data !== "object")
        return data;
    if (Array.isArray(data)) {
        return data.map((item) => sanitizeTelemetryData(item));
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (REDACTED_KEYS.has(lowerKey)) {
            sanitized[key] = "[REDACTED]";
        }
        else if (typeof value === "object" && value !== null) {
            sanitized[key] = sanitizeTelemetryData(value);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
//# sourceMappingURL=traceContext.js.map