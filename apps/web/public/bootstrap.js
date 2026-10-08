if (typeof window !== "undefined") {
  window.process = window.process || { env: { NODE_ENV: "development" }, platform: "browser" };
  window.global = window.global || window;
}
