import { spawn, execFileSync } from "node:child_process";
import { resolve } from "node:path";

const TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 15 * 1000;
const tscEntry = resolve(process.cwd(), "node_modules/typescript/bin/tsc");

console.log("[TYPECHECK] START root tsconfig.json");
console.log(`[TYPECHECK] compiler=${tscEntry}`);
console.log(`[TYPECHECK] timeoutMs=${TIMEOUT_MS}`);

const child = spawn(process.execPath, [tscEntry, "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
  env: process.env,
});

let settled = false;
const startedAt = Date.now();

child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
child.stderr?.on("data", (chunk) => process.stderr.write(chunk));

const heartbeat = setInterval(() => {
  if (!settled) {
    console.log(`[TYPECHECK] HEARTBEAT elapsedMs=${Date.now() - startedAt} pid=${child.pid ?? "unknown"}`);
  }
}, HEARTBEAT_MS);
heartbeat.unref();

const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  console.error(`[TYPECHECK] TIMEOUT elapsedMs=${Date.now() - startedAt}`);
  try {
    if (process.platform === "win32" && child.pid) {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try { child.kill("SIGKILL"); } catch {}
  }
  process.exitCode = 124;
}, TIMEOUT_MS);

child.once("error", (error) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  clearInterval(heartbeat);
  console.error(`[TYPECHECK] SPAWN_ERROR ${error.message}`);
  process.exitCode = 1;
});

child.once("close", (code, signal) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  clearInterval(heartbeat);
  const elapsedMs = Date.now() - startedAt;
  const exitCode = typeof code === "number" ? code : 1;
  console.log(`[TYPECHECK] EXIT_CODE=${exitCode} signal=${signal ?? "none"} elapsedMs=${elapsedMs}`);
  if (exitCode !== 0) process.exitCode = exitCode;
});
