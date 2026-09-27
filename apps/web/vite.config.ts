import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const browserCryptoPath = path.resolve(__dirname, "src/utils/browserCrypto.ts");

const configureProxy = (proxy: any) => {
  proxy.on("error", (_err: any, _req: any, res: any) => {
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

  proxy.on("proxyReq", (_proxyReq: any, req: any) => {
    if (req && typeof req.on === "function") {
      req.on("error", () => {});
    }
  });

  proxy.on("proxyRes", (_proxyRes: any, _req: any, res: any) => {
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
