import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const browserCryptoPath = path.resolve(__dirname, "src/utils/browserCrypto.ts");

// Ignore transient socket resets from client browser disconnects/reloads
process.on("uncaughtException", (err: any) => {
  if (err?.code === "ECONNRESET" || err?.code === "EPIPE" || err?.code === "ECONNABORTED") {
    return;
  }
  console.error("[Vite Uncaught Exception]", err);
  process.exit(1);
});

const configureProxy = (proxy: any) => {
  proxy.on("error", (err: any, _req: any, res: any) => {
    if (err?.code === "ECONNRESET" || err?.code === "EPIPE" || err?.code === "ECONNABORTED") {
      return;
    }
    try {
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
      } else if (res && typeof res.destroy === "function" && !res.destroyed) {
        res.destroy();
      }
    } catch {
      // Safe no-op on aborted or already closed client sockets
    }
  });

  proxy.on("proxyReq", (proxyReq: any, req: any) => {
    if (proxyReq && typeof proxyReq.on === "function") {
      proxyReq.on("error", () => {});
    }
    if (req && typeof req.on === "function") {
      req.on("error", () => {});
    }
  });

  proxy.on("proxyRes", (proxyRes: any, _req: any, res: any) => {
    if (proxyRes && typeof proxyRes.on === "function") {
      proxyRes.on("error", () => {});
    }
    if (res && typeof res.on === "function") {
      res.on("error", () => {});
    }
  });
};

const webPort = process.env.WEB_PORT
  ? parseInt(process.env.WEB_PORT, 10)
  : process.env.PORT && process.env.PORT !== "3000"
    ? parseInt(process.env.PORT, 10)
    : 5173;

export default defineConfig({
  resolve: {
    alias: {
      "node:crypto": browserCryptoPath,
      "crypto": browserCryptoPath,
      "@node-rs/argon2": path.resolve(__dirname, "src/utils/serverOnlyArgon2.ts"),
    },
  },
  define: {
    "process.env": {},
  },
  build: {
    // Keep Vite's warning threshold aligned with the enforced production
    // bundle budget. Chunks above 750 KB remain a release-blocking failure
    // in scripts/release/check-bundle-size.ts.
    chunkSizeWarningLimit: 500,
  },
  server: {
    host: true,
    port: webPort,
    strictPort: false,
    proxy: {
      "/auth": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
      "/sync": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
      "/admin": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
      "/telemetry": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
      "/health": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
      "/version": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: configureProxy,
      },
    },
  },
});
