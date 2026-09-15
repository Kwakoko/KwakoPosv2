import { defineConfig } from "vite";

const configureProxy = (proxy: any) => {
  proxy.on("error", (_err: any, _req: any, res: any) => {
    if (res && !res.headersSent && typeof res.writeHead === "function") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: "BACKEND_UNAVAILABLE",
            message: "API server (port 3000) is unreachable. Please ensure the backend server is running.",
          },
        })
      );
    }
  });
};

export default defineConfig({
  build: {
    // Keep Vite's warning threshold aligned with the enforced production
    // bundle budget. Chunks above 750 KB remain a release-blocking failure
    // in scripts/release/check-bundle-size.ts.
    chunkSizeWarningLimit: 500,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/auth": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
      "/sync": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
      "/admin": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
      "/telemetry": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
      "/health": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
      "/version": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: configureProxy,
      },
    },
  },
});
