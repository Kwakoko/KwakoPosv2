"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultLogger = exports.StructuredLogger = void 0;
const traceContext_js_1 = require("./traceContext.js");
class StructuredLogger {
    serviceName;
    gcpProjectId;
    constructor(serviceName = "kwakopos-api", gcpProjectId = process.env.GCP_PROJECT_ID || "kwakoposv2") {
        this.serviceName = serviceName;
        this.gcpProjectId = gcpProjectId;
    }
    log(severity, message, data, traceContext, error) {
        const entry = {
            severity,
            message,
            timestamp: new Date().toISOString(),
            traceContext: traceContext ? (0, traceContext_js_1.sanitizeTelemetryData)(traceContext) : undefined,
            data: data ? (0, traceContext_js_1.sanitizeTelemetryData)(data) : undefined,
            error: error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                }
                : undefined,
        };
        const gcpPayload = {
            severity: entry.severity,
            message: entry.message,
            serviceContext: { service: this.serviceName, version: traceContext?.appVersion || "2.0.0" },
            timestamp: entry.timestamp,
            ...(entry.data || {}),
        };
        if (traceContext?.traceId && this.gcpProjectId) {
            gcpPayload["logging.googleapis.com/trace"] = `projects/${this.gcpProjectId}/traces/${traceContext.traceId}`;
        }
        if (traceContext?.spanId) {
            gcpPayload["logging.googleapis.com/spanId"] = traceContext.spanId;
        }
        if (entry.error) {
            gcpPayload["error"] = entry.error;
        }
        if (process.env.NODE_ENV !== "test") {
            const output = JSON.stringify(gcpPayload);
            if (severity === "ERROR" || severity === "CRITICAL") {
                console.error(output);
            }
            else {
                console.log(output);
            }
        }
        return entry;
    }
    debug(msg, data, ctx) {
        return this.log("DEBUG", msg, data, ctx);
    }
    info(msg, data, ctx) {
        return this.log("INFO", msg, data, ctx);
    }
    warn(msg, data, ctx) {
        return this.log("WARNING", msg, data, ctx);
    }
    error(msg, error, data, ctx) {
        return this.log("ERROR", msg, data, ctx, error);
    }
    critical(msg, error, data, ctx) {
        return this.log("CRITICAL", msg, data, ctx, error);
    }
}
exports.StructuredLogger = StructuredLogger;
exports.defaultLogger = new StructuredLogger();
//# sourceMappingURL=structuredLogger.js.map