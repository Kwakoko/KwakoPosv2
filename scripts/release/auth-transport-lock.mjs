import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const api = read("apps/web/src/services/apiClient.ts");
const srv = read("apps/api/src/serverFixed.ts");

const fail = (message) => { throw new Error("AUTH_TRANSPORT_LOCK_FAILED: " + message); };
const req = (ok, message) => { if (!ok) fail(message); };

req(!/(^|[^A-Za-z0-9_])refreshToken([^A-Za-z0-9_]|$)/.test(api), "web client must not contain refreshToken token handling");
req(!/(^|[^A-Za-z0-9_])refresh-token([^A-Za-z0-9_]|$)/.test(api), "web client must not contain refresh-token handling");
req(srv.includes("HttpOnly") && srv.includes("SameSite=Strict"), "production refresh cookie must be hardened");
req(srv.includes("setRefreshCookie(reply, session.refreshToken, true)"), "production login must issue refresh token via hardened cookie");
req(srv.includes("setRefreshCookie(reply, rotated.refreshToken, true)"), "production refresh must rotate refresh token via hardened cookie");
req(srv.includes("reply.send({ success: true, data: { accessToken: rotated.accessToken } });"), "production refresh JSON must contain accessToken only");
req(!/reply\.send\(\{\s*success:\s*true,\s*data:\s*\{[^}]*\brefreshToken\b/s.test(srv), "authentication JSON must never return refreshToken");

console.log("AUTH_TRANSPORT_LOCK: PASS");
