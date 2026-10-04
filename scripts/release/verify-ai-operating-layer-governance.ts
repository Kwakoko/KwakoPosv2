import fs from "node:fs";
import path from "node:path";
import { AI_OPERATING_LAYER_GOVERNANCE as G } from "@kwakopos2/config";

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const checks:Array<[string,boolean]>=[];
const pass=(name:string,ok:boolean)=>{checks.push([name,ok]);console.log((ok?"PASS ":"FAIL ")+name);};
const files=[
"packages/contracts/src/aiOperatingLayerContracts.ts",
"packages/domain/src/aiOperatingLayerEngine.ts",
"packages/database/src/aiInsightsRepository.ts",
"apps/api/src/services/aiOperatingLayerService.ts",
"apps/web/src/pages/WorkspacePages.tsx",
"packages/database/prisma/schema.prisma",
"packages/database/prisma/migrations/20261004110000_ai_insights_governance/migration.sql",
"tests/unit/ai-operating-layer.test.ts",
"tests/security/aiAuthorizationAdversarial.test.ts",
];
for(const p of files)pass("file:"+p,fs.existsSync(path.join(root,p)));
const engine=read("packages/domain/src/aiOperatingLayerEngine.ts"),service=read("apps/api/src/services/aiOperatingLayerService.ts"),repository=read("packages/database/src/aiInsightsRepository.ts"),server=read("apps/api/src/server.ts"),page=read("apps/web/src/pages/WorkspacePages.tsx"),schema=read("packages/database/prisma/schema.prisma"),cert=read("scripts/certification/ai-operating-layer-certification-engine.ts");
pass("governance-version",G.version==="1.0.0");
pass("tenant-boundary",engine.includes("ctx.tenantId")&&engine.includes("ctx.branchId")&&repository.includes("tenantId:ctx.tenantId")&&repository.includes("branchId:ctx.branchId"));
pass("evidence-boundary",read("packages/contracts/src/aiOperatingLayerContracts.ts").includes("AiEvidenceItemSchema"));
pass("durable-persistence",schema.includes("model AiInsight")&&schema.includes("model AiRecommendation")&&service.includes("globalPrismaAiInsightsRepository"));
pass("rls-persistence",read("packages/database/prisma/migrations/20261004110000_ai_insights_governance/migration.sql").includes("ENABLE ROW LEVEL SECURITY"));
pass("approval-gate",service.includes("purchase_approve")&&service.includes("AI_KILL_SWITCH_ACTIVE"));
pass("kill-switch",repository.includes("AI-KILL-GLOBAL")&&repository.includes("AI-KILL-TENANT-")&&service.includes("toggleKillSwitch"));
pass("route-authorization",server.includes("requireAiViewerContext")&&server.includes("requireAiApprovalContext")&&server.includes("requireAiKillSwitchContext"));
pass("ui-api-closure",page.includes("/api/v1/ai-operating-layer/insights")&&page.includes("/api/v1/ai-operating-layer/kill-switch"));
pass("no-business-hardcoding",!/(Panadol 500mg|SKU-9020|TEN-001|94\.2%|1,482|10 Agents)/.test(engine+page));
pass("behavioral-certification",cert.includes("const check=")&&!cert.includes("addResult(")&&!cert.includes(", true,"));
pass("fail-closed-query",engine.includes("AI_QUERY_UNSUPPORTED"));
const failed=checks.filter(([,ok])=>!ok).length;
const out=path.join(root,"artifacts","governance","ai-operating-layer-certificate.json");
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify({certificateId:G.certificateId,version:G.version,passed:failed===0,checks:checks.length,failures:failed,evidenceBoundary:"Repository controls and behavioral tests; not proof of external model/vendor outcomes."},null,2));
console.log("Kwakoko AI Operating Layer Governance: "+(checks.length-failed)+"/"+checks.length);
if(failed)process.exit(1);
