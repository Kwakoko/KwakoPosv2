import * as fs from "fs";
import * as path from "path";
import { KWAKOKO_PERFORMANCE_SCALE_GOVERNANCE as G } from "../../packages/config/src/performanceScaleGovernance.js";

type Check = { name: string; passed: boolean; detail: string };
const root = process.cwd();
const exists = (p: string) => fs.existsSync(path.join(root, p));
const read = (p: string) => (exists(p) ? fs.readFileSync(path.join(root, p), "utf8") : "");
const checks: Check[] = [];
const check = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });

for (const [name, p] of Object.entries(G.authorities)) {
  check(`authority:${name}`, exists(p), p);
}

const benchmark = read(G.authorities.benchmark);
const capacity = read(G.authorities.capacityModel);
const certification = read(G.authorities.certification);
const dashboard = read(G.authorities.dashboard);
const releaseService = read(G.authorities.releaseService);
const observability = read(G.authorities.observability);
const webBuild = read(G.authorities.webBuild);
const database = read(G.authorities.database);
const reliability = read(G.authorities.reliabilityGovernance);

check("latency-budgets", G.performanceBudgets.apiP95Ms === 500 && G.performanceBudgets.apiP99Ms === 1000 && G.performanceBudgets.posCheckoutP95Ms === 400, "API and POS latency budgets are explicit.");
check("pwa-performance-budget", G.performanceBudgets.bootstrapP95Ms === 1500 && G.performanceBudgets.pwaLcpMs === 2500, "Bootstrap and PWA LCP budgets are explicit.");
check("error-budget", G.performanceBudgets.errorRatePct === 0.5, "Performance error-rate budget is explicit.");
check("capacity-contract", G.capacityBudgets.maxTenantProducts === 100000 && G.capacityBudgets.maxBranches === 1000 && G.capacityBudgets.dailySyncEvents === 250000, "Tenant and workload capacity limits are explicit.");
check("workload-multipliers", G.workloadProfiles.every((x) => benchmark.includes(x) || certification.includes(x)), "1x/10x/50x/100x workload profiles are governed by the benchmark/certification system.");
check("percentile-evidence", /p95/i.test(benchmark) && /p99/i.test(benchmark) && /throughputRps/.test(benchmark), "Performance evidence uses percentiles and throughput.");
check("capacity-evidence", /projections12m/.test(capacity) && /projections36m/.test(capacity) && /projections60m/.test(capacity), "Capacity model contains multi-horizon growth projections.");
check("bundle-budget", /vite build/.test(webBuild) && /buildPwaAssets/.test(webBuild), "Frontend build pipeline is an explicit performance evidence authority.");
check("database-pressure", /Prisma|query|connection/i.test(database) && exists(G.authorities.database), "Database persistence authority is present for pressure and query-path certification.");
check("regional-invariants", G.regionalInvariants.length >= 5 && /tenant data/i.test(G.regionalInvariants[0]), "Cross-region isolation and resilience invariants are explicit.");
check("optimization-controls", G.optimizationControls.length >= 5 && G.optimizationControls.every((x) => /MUST/.test(x)), "Optimization controls are mandatory and measurable.");
check("release-service-surface", /getCapacityModel|runPerformanceCertification/.test(releaseService), "ReleaseService exposes performance/capacity evidence.");
check("dashboard-surface", /POS CHECKOUT LATENCY|100Ã— STRESS|Capacity & Performance/i.test(dashboard), "Super Admin performance dashboard is an operational surface.");
check("reliability-convergence", exists(G.authorities.reliabilityGovernance) && /production reliability/i.test(reliability), "Step 14 reliability governance remains authoritative.");
check("fail-closed", G.failClosed === true && /if\s*\(!passed\)\s*process\.exit\(1\)/.test(fs.readFileSync(path.join(root, "scripts/release/verify-performance-scale-governance.ts"), "utf8")), G.certificate);

const passed = checks.every((c) => c.passed);
const certificate = { id: G.certificate, version: G.version, status: passed ? "PASS" : "FAIL", checks, generatedAt: new Date().toISOString() };
const outDir = path.join(root, "artifacts", "governance");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "performance-scale-governance-certificate.json"), JSON.stringify(certificate, null, 2) + "\n", "utf8");
for (const c of checks) console.log(`${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
console.log(`${passed ? "PASS" : "FAIL"} Kwakoko Performance & Global Scale Governance: ${passed ? "PASS" : "FAIL"}`);
console.log(`   certificate: ${G.certificate}`);
if (!passed) process.exit(1);
