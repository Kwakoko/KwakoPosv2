import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const api = read("apps/web/src/services/apiClient.ts");
const srv = read("apps/api/src/server.ts");

const fail = (message) => { throw new Error("AUTH_TRANSPORT_LOCK_FAILED: " + message); };
const req = (ok, message) => { if (!ok) fail(message); };

req(!/\brefreshToken\b/.test(api), "web client must not contain refresh-token credential handling");
req(!api.includes("refresh-token"), "web client must not contain refresh-token handling");
req(!srv.includes('createHash("sha256").update(password + getJwtSecret())'), "password verification must not use the legacy secret-dependent SHA-256 fallback");
req(srv.includes("HttpOnly") && srv.includes("SameSite=Strict") && srv.includes('; Secure'), "production refresh cookie must use the HttpOnly; Secure; SameSite=Strict design");
req(srv.includes("setRefreshCookie(reply, session.refreshToken"), "canonical login must issue refresh token via hardened cookie");
req(!srv.includes("Bearer\\\\s+"), "session endpoint Bearer parsing must match a normal Authorization header");
req(srv.includes('!/^\\/auth\\/session(?:\\/|$)/.test(authenticatedPath)'), "legal acceptance gate must permit authenticated session lifecycle checks");
req(srv.includes("setRefreshCookie(reply, rotated.refreshToken"), "canonical refresh must rotate refresh token via hardened cookie");
req(/reply\.send\(\{ success: true, data: \{ accessToken: rotated\.accessToken, sessionId:/.test(srv), "canonical refresh JSON must contain accessToken/sessionId only");
req(!/reply\.send\(\{\s*success:\s*true,\s*data:\s*\{[^}]*\brefreshToken\b/s.test(srv), "authentication JSON must never return refreshToken");

console.log("AUTH_TRANSPORT_LOCK: PASS");
