import { spawn } from "node:child_process";

if (typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {
    // ignore
  }
}

console.log("\x1b[36m[KwakoPos]\x1b[0m Starting API server (http://127.0.0.1:3000) and Web client (http://localhost:5173)...");

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

const api = spawn(npmCmd, ["run", "dev:api"], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: isWindows,
  env: { ...process.env, PORT: "3000", HOST: "0.0.0.0" },
});

const web = spawn(npmCmd, ["run", "dev:web"], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: isWindows,
  env: { ...process.env },
});

const cleanup = () => {
  try {
    api.kill();
    web.kill();
  } catch {
    // Process cleanup
  }
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
api.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`[KwakoPos API] exited with code ${code}`);
  }
});
web.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`[KwakoPos Web] exited with code ${code}`);
  }
});
