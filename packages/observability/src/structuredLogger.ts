import { TraceContext, sanitizeTelemetryData } from "./traceContext.js";

export type LogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface LogEntry {
  severity: LogSeverity;
  message: string;
  timestamp: string;
  traceContext?: Partial<TraceContext>;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class StructuredLogger {
  private serviceName: string;
  private gcpProjectId?: string;

  constructor(serviceName = "kwakopos-api", gcpProjectId = process.env.GCP_PROJECT_ID || "kwakoposv2") {
    this.serviceName = serviceName;
    this.gcpProjectId = gcpProjectId;
  }

  log(severity: LogSeverity, message: string, data?: Record<string, unknown>, traceContext?: Partial<TraceContext>, error?: Error): LogEntry {
    const entry: LogEntry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      traceContext: traceContext ? (sanitizeTelemetryData(traceContext) as Partial<TraceContext>) : undefined,
      data: data ? sanitizeTelemetryData(data) : undefined,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    const gcpPayload: Record<string, any> = {
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
      } else {
        console.log(output);
      }
    }

    return entry;
  }

  debug(msg: string, data?: Record<string, unknown>, ctx?: Partial<TraceContext>) {
    return this.log("DEBUG", msg, data, ctx);
  }

  info(msg: string, data?: Record<string, unknown>, ctx?: Partial<TraceContext>) {
    return this.log("INFO", msg, data, ctx);
  }

  warn(msg: string, data?: Record<string, unknown>, ctx?: Partial<TraceContext>) {
    return this.log("WARNING", msg, data, ctx);
  }

  error(msg: string, error?: Error, data?: Record<string, unknown>, ctx?: Partial<TraceContext>) {
    return this.log("ERROR", msg, data, ctx, error);
  }

  critical(msg: string, error?: Error, data?: Record<string, unknown>, ctx?: Partial<TraceContext>) {
    return this.log("CRITICAL", msg, data, ctx, error);
  }
}

export const defaultLogger = new StructuredLogger();