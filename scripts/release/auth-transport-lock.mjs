import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const api = read("apps/web/src/services/apiClient.ts");
const srv = read("apps/api/src/serverFixed.ts");

const fail = (message) => { throw new Error("AUTH_TRANSPORT_LOCK_FAILED: " + message); };
const req = (ok, message) => { if (!ok) fail(message); };

// The browser may expose non-secret session metadata such as refreshTokenExpiresAt,
// but it must never store, transmit, or persist the refresh token itself.
req(!/(^|[^A-Za-z0-9_])refreshToken([^A-Za-z0-9_]|$)/.test(api), "web client must not contain refreshToken handling");
req(!api.includes("refresh-token"), "web client must not contain refresh-token handling");
req(srv.includes("HttpOnly") && srv.includes("SameSite=Strict"), "production refresh cookie must be hardened");
req(srv.includes("setRefreshCookie(reply, session.refreshToken, isProduction(config),"), "production login must issue refresh token via hardened cookie");
req(srv.includes("setRefreshCookie(reply, rotated.refreshToken, isProduction(loadConfig()),"), "production refresh must rotate refresh token via hardened cookie");
req(
  srv.includes("return reply.send({ success: true, data: { accessToken: rotated.accessToken, sessionId } });"),
  "production refresh JSON must contain accessToken and no refresh token",
);
req(!/reply\.send\(\{\s*success:\s*true,\s*data:\s*\{[^}]*\brefreshToken\b/s.test(srv), "authentication JSON must never return refreshToken");

console.log("AUTH_TRANSPORT_LOCK: PASS");
