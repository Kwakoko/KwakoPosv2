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
export declare function generateTraceId(): string;
export declare function generateSpanId(): string;
export declare function createTraceContext(partial: Partial<TraceContext>): TraceContext;
export declare function sanitizeTelemetryData<T>(data: T): T;
//# sourceMappingURL=traceContext.d.ts.map