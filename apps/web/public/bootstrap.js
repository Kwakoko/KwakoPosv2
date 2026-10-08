// Minimal pre-React browser bootstrap. Kept external so production CSP can forbid inline scripts.
if (typeof window !== "undefined") {
  window.process = window.process || { env: { NODE_ENV: "development" }, platform: "browser" };
  window.global = window.global || window;
}
