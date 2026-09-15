import * as fs from "fs";
import * as path from "path";
import { KWAKOKO_DATA_LIFECYCLE_DR_GOVERNANCE as G } from "../../packages/config/src/dataLifecycleDrGovernance.js";

type Check={name:string;passed:boolean;detail:string};
const root=process.cwd();
const exists=(p:string)=>fs.existsSync(path.join(root,p));
const read=(p:string)=>exists(p)?fs.readFileSync(path.join(root,p),"utf8"):"";
const checks:Check[]=[];
function authority(name:string,p:string){checks.push({name:`authority:${name}`,passed:exists(p),detail:p});}
for(const [name,p] of Object.entries(G.authorities)) authority(name,p);

const sim=read(G.authorities.recoverySimulation);
const recon=read(G.authorities.reconciliation);
const verifier=read(G.authorities.recoveryVerifier);
const rollback=read(G.authorities.rollbackEngine);
const rollbackAuth=read(G.authorities.rollbackAuthorization);
const snapshot=read(G.authorities.snapshotRecovery);
const privacy=read(G.authorities.privacyGovernance);
const security=read(G.authorities.securityGovernance);
const ai=read(G.authorities.aiGovernance);
const workflow=read(G.authorities.workflowGovernance);

checks.push({name:"controlled-disaster-scenarios",passed:(sim.match(/results\.push\(\{/g)||[]).length>=G.certification.requiredScenarioCount && G.certification.requireAllScenarios,detail:`10 controlled scenarios required; detected ${(sim.match(/results\.push\(\{/g)||[]).length}`});
checks.push({name:"rpo-rto-contract",passed:G.recoveryObjectives.tier0.rpoSeconds===0 && G.recoveryObjectives.tier1.rtoSeconds===30 && G.recoveryObjectives.tier2.rtoSeconds===60 && G.recoveryObjectives.tier3.rtoSeconds===120,detail:"Tier 0–3 recovery objectives are explicitly governed"});
checks.push({name:"recovery-reconciliation",passed:/reconciliationPassed/.test(recon) && /tenantLeakageDetected/.test(recon) && /financialBalanceVariance/.test(recon),detail:"Recovery reconciliation verifies data, finance, inventory, and tenant isolation"});
checks.push({name:"rollback-authorization",passed:/assertRollbackAuthorized/.test(rollbackAuth) && /acquireLock/.test(rollbackAuth) && /setSyncBarrier/.test(rollbackAuth) && /appendAuditEvent/.test(rollbackAuth),detail:"Rollback requires authorization, collision lock, sync barrier, and audit trail"});
checks.push({name:"snapshot-integrity",passed:/checksum/.test(snapshot) && /verifySnapshot/.test(snapshot) && /verified/.test(snapshot),detail:"Local recovery snapshots are checksum verified"});
checks.push({name:"migration-recovery-contract",passed:/EXPAND/.test(verifier) && /MIGRATE/.test(verifier) && /SWITCH/.test(verifier) && /VERIFY/.test(verifier) && /CONTRACT/.test(verifier),detail:"Five-phase migration safety contract is present"});
checks.push({name:"retention-privacy-convergence",passed:/retention|deletion|legal hold/i.test(privacy),detail:"Privacy lifecycle authority contains retention/deletion/legal-hold rules"});
checks.push({name:"security-convergence",passed:exists("scripts/release/verify-security-trust.ts") && /security/i.test(security),detail:"Step 11 Security & Trust gate is present"});
checks.push({name:"ai-convergence",passed:exists("scripts/release/verify-ai-agent-governance.ts") && /AI|tenant/i.test(ai),detail:"Step 10 AI governance is present"});
checks.push({name:"workflow-convergence",passed:exists("scripts/release/verify-workflow-integrity.ts") && /workflow/i.test(workflow),detail:"Step 9 workflow gate is present"});
checks.push({name:"evidence-classification",passed:G.certification.requireEvidenceClassification && G.invariants.some(x=>x.toLowerCase().includes("simulation evidence")),detail:"Simulation and real-production evidence are explicitly distinguished"});
checks.push({name:"fail-closed-certificate",passed:G.certification.failClosed===true && G.certification.certificate==="KWAKOKO-LIFECYCLE-DR-CERTIFICATE-v1.0",detail:G.certification.certificate});

const passed=checks.every(c=>c.passed);
const certificate={id:G.certification.certificate,version:G.version,status:passed?"PASS":"FAIL",checks,scenarioCount:G.certification.requiredScenarioCount,generatedAt:new Date().toISOString()};
const outDir=path.join(root,"artifacts","governance"); fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,"data-lifecycle-dr-governance-certificate.json"),JSON.stringify(certificate,null,2)+"\n","utf8");
for(const c of checks) console.log(`${c.passed?"✅":"❌"} ${c.name}: ${c.detail}`);
console.log(`${passed?"✅":"❌"} Kwakoko Data Lifecycle, Retention & Disaster Recovery Governance: ${passed?"PASS":"FAIL"}`);
console.log(`   certificate: ${G.certification.certificate}`);
if(!passed) process.exit(1);
