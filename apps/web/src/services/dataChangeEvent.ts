/** Typed, scoped application data-change notification boundary. */
export const DATA_CHANGED_EVENT = "kwakopos:data-changed" as const;

export interface DataChangeDetail {
  [key: string]: unknown;
  action: string;
  tenantId?: string | null;
  branchId?: string | null;
  entityType?: string;
  entityId?: string;
  source?: string;
  timestamp?: string;
}

export type DataChangeHandler = (detail: DataChangeDetail) => void;

export function publishDataChanged(
  detail: Omit<DataChangeDetail, "timestamp">,
): void {
  if (typeof window === "undefined") return;
  const eventDetail: DataChangeDetail = {
    ...detail,
    timestamp: new Date().toISOString(),
  };
  try {
    window.dispatchEvent(new CustomEvent<DataChangeDetail>(DATA_CHANGED_EVENT, {
      detail: eventDetail,
    }));
  } catch {
    // UI notification transport must never break a committed durable mutation.
  }
}

export function subscribeDataChanged(
  handler: DataChangeHandler,
  scope?: { tenantId?: string | null; branchId?: string | null },
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<DataChangeDetail>).detail;
    if (!detail || typeof detail.action !== "string") return;
    if (scope?.tenantId && detail.tenantId && detail.tenantId !== scope.tenantId) return;
    if (scope?.branchId && detail.branchId && detail.branchId !== scope.branchId) return;
    handler(detail);
  };
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}
