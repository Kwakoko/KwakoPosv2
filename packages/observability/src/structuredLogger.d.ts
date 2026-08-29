import { TraceContext } from "./traceContext.js";
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
export declare class StructuredLogger {
    private serviceName;
    private gcpProjectId?;
    constructor(serviceName?: string, gcpProjectId?: string);
    log(severity: LogSeverity, message: string, data?: Record<string, unknown>, traceContext?: Partial<TraceContext>, error?: Error): LogEntry;
    debug(msg: string, data?: Record<string, unknown>, ctx?: Partial<TraceContext>): LogEntry;
    info(msg: string, data?: Record<string, unknown>, ctx?: Partial<TraceContext>): LogEntry;
    warn(msg: string, data?: Record<string, unknown>, ctx?: Partial<TraceContext>): LogEntry;
    error(msg: string, error?: Error, data?: Record<string, unknown>, ctx?: Partial<TraceContext>): LogEntry;
    critical(msg: string, error?: Error, data?: Record<string, unknown>, ctx?: Partial<TraceContext>): LogEntry;
}
export declare const defaultLogger: StructuredLogger;
//# sourceMappingURL=structuredLogger.d.ts.map