import { spawn, execSync, type ChildProcess } from "node:child_process";

if (typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {
    // ignore
  }
}

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

function findPidsOnPort(port: number): number[] {
  if (isWindows) {
    try {
      const output = execSync("netstat -ano -p tcp", { encoding: "utf8" });
      const pids: number[] = [];
      for (const line of output.split("\n")) {
        if (line.includes("LISTENING") && (line.includes(`:${port} `) || line.includes(`:${port}\t`))) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && !pids.includes(pid) && pid !== process.pid) {
            pids.push(pid);
          }
        }
      }
      return pids;
    } catch {
      return [];
    }
  } else {
    try {
      const output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" });
      return output
        .trim()
        .split(/\s+/)
        .map((p) => parseInt(p, 10))
        .filter((p) => p && p !== process.pid);
    } catch {
      return [];
    }
  }
}

function freePort(port: number) {
  const pids = findPidsOnPort(port);
  for (const pid of pids) {
    try {
      console.log(`\x1b[33m[KwakoPos]\x1b[0m Port ${port} is currently occupied by PID ${pid}. Terminating orphaned process...`);
      if (isWindows) {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch {
      // Process may have already exited
    }
  }
}

function killTree(child?: ChildProcess) {
  if (!child || !child.pid) return;
  try {
    if (isWindows) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  } catch {
    // Process already terminated
  }
}

// Ensure port 3000 (API) is clear before starting
freePort(3000);

console.log("\x1b[36m[KwakoPos]\x1b[0m Starting API server (http://127.0.0.1:3000) and Web client (dynamic port)...");

// Use command string on Windows with shell: true to avoid DEP0190 warning
const api = isWindows
  ? spawn(`${npmCmd} run dev:api`, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
      env: { ...process.env, PORT: "3000", HOST: "0.0.0.0" },
    })
  : spawn(npmCmd, ["run", "dev:api"], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: false,
      env: { ...process.env, PORT: "3000", HOST: "0.0.0.0" },
    });

const web = isWindows
  ? spawn(`${npmCmd} run dev:web`, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
      env: { ...process.env },
    })
  : spawn(npmCmd, ["run", "dev:web"], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: false,
      env: { ...process.env },
    });

let isCleaningUp = false;
const cleanup = (exitCode = 0) => {
  if (isCleaningUp) return;
  isCleaningUp = true;
  killTree(api);
  killTree(web);
  process.exit(exitCode);
};

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
process.on("SIGBREAK", () => cleanup(0));

api.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`[KwakoPos API] exited with code ${code}`);
    cleanup(code);
  }
});

web.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`[KwakoPos Web] exited with code ${code}`);
    cleanup(code);
  }
});
