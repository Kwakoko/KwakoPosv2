export const DEVICE_ID_STORAGE_KEY = "kwakopos:v2:device-id";

export function getOrCreatePersistentDeviceId(prefix = "web"): string {
  if (typeof window === "undefined") return "server-rendered-client";

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    if (existing) return existing;

    const generatedUuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const generated = `${prefix}-${generatedUuid}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);

    const persisted = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    if (persisted !== generated) {
      throw new Error("DEVICE_ID_PERSISTENCE_FAILED: device identity could not be durably stored");
    }
    return generated;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("DEVICE_ID_PERSISTENCE_FAILED")) throw error;
    throw new Error("DEVICE_ID_PERSISTENCE_REQUIRED: localStorage is unavailable; durable device identity is mandatory", { cause: error });
  }
}
