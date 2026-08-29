import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { loadConfig } from "@kwakopos2/config";
import { runDisasterRecoverySimulationSuite } from "./disaster-recovery-simulator.js";
export async function runResilienceCertification() {
    const config = loadConfig();
    const sim = await runDisasterRecoverySimulationSuite();
    const exerciseId = `DR-KWAKOPOS-${new Date().toISOString().split("T")[0]}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const evidencePackage = {
        exerciseId,
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV || "production",
        appVersion: config.APP_VERSION || "2.4.0",
        gitSha: process.env.GIT_SHA || "2198132a6f1d07c393bc673bdc353fbc4ee7998b",
        overallScore: sim.score,
        status: sim.allPassed ? "PASS" : "FAIL",
        scenariosExecuted: sim.results.length,
        scenariosPassed: sim.results.filter((r) => r.status === "PASS").length,
        results: sim.results,
        digest: "",
    };
    const rawJson = JSON.stringify({ ...evidencePackage, digest: undefined }, null, 2);
    evidencePackage.digest = createHash("sha256").update(rawJson).digest("hex");
    const artifactsDir = path.resolve(process.cwd(), "artifacts", "resilience-evidence");
    if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
    }
    const evidencePath = path.join(artifactsDir, `${exerciseId}.json`);
    fs.writeFileSync(evidencePath, JSON.stringify(evidencePackage, null, 2), "utf-8");
    console.log(`\n========================================================================`);
    console.log(` KWAKOPOS PHASE 13 DISASTER RECOVERY & RESILIENCE CERTIFICATION ENGINE  `);
    console.log(` Standard: KwakoPos Disaster Recovery & Resilience Standard (KDRRS)    `);
    console.log(` Exercise ID: ${exerciseId}                                            `);
    console.log(` Version: ${evidencePackage.appVersion} | Git SHA: ${evidencePackage.gitSha.slice(0, 7)}`);
    console.log(`========================================================================`);
    for (const r of sim.results) {
        const icon = r.status === "PASS" ? "✓ [PASS]" : "✗ [FAIL]";
        console.log(` ${icon} ${r.scenario.padEnd(25)} (${r.tier}) RPO: ${r.rpo.actualRpoSeconds}s/${r.rpo.targetRpoSeconds}s | RTO: ${r.rto.actualRtoSeconds}s/${r.rto.targetRtoSeconds}s`);
    }
    console.log(`========================================================================`);
    console.log(` 🏆 PHASE 13 DISASTER RECOVERY & RESILIENCE RESULT: ${evidencePackage.status}`);
    console.log(` Score: ${evidencePackage.overallScore}% (${evidencePackage.scenariosPassed}/${evidencePackage.scenariosExecuted} Disaster Scenarios Certified)`);
    console.log(` Evidence Artifact: ${evidencePath}`);
    console.log(`========================================================================\n`);
    return {
        passed: sim.allPassed,
        evidencePackage,
        evidencePath,
    };
}
if (process.argv[1]?.endsWith("runResilienceCertification.ts")) {
    runResilienceCertification().then((res) => {
        if (!res.passed) {
            process.exit(1);
        }
    });
}
//# sourceMappingURL=runResilienceCertification.js.map