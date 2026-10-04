/**
 * Application API facade.
 *
 * UI modules must call the application boundary rather than importing the
 * transport implementation directly. The facade intentionally re-exports the
 * stable request/auth primitives so transport changes remain isolated here.
 */
export * from "./apiClient.js";
