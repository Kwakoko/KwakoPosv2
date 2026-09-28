import "fake-indexeddb/auto";

// Node/Vitest persistence suites need a deterministic IndexedDB implementation.
// Browser/Playwright suites continue to use the real browser IndexedDB runtime.
