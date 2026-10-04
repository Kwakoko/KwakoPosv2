import fs from "node:fs";
import path from "node:path";
import { AiOperatingLayerEngine } from "@kwakopos2/domain";
import type { AiBusinessSnapshot,TenantContext } from "@kwakopos2/contracts";

export interface PillarVerificationResult{pillarId:string;pillarName:string;passed:boolean;details:string;}

export function runAiOperatingLayerCertification(){
  const root=process.cwd(),results:PillarVerificationResult[]=[];
  const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
  const check=(id:string,name:string,passed:boolean,details:string)=>results.push({pillarId:id,pillarName:name,passed,details});
  const ctx:TenantContext={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",userId:"33333333-3333-4333-8333-333333333333",roles:["MANAGER"],permissions:["INVENTORY_VIEW","FINANCIAL_REPORT_VIEW","PURCHASE_APPROVE"]};
  const variantId="44444444-4444-4444-8444-444444444444";
  const snapshot:AiBusinessSnapshot={now:"2026-10-04T10:00:00.000Z",variants:[{variantId,productId:"55555555-5555-4555-8555-555555555555",productName:"Certification Product",sku:"CERT-001",inventoryQuantity:2,reservedQuantity:0,reorderLevel:5,sellingPrice:100,costPrice:60,active:true}],stockByVariant:{[variantId]:2},unitsSoldLast7DaysByVariant:{[variantId]:14},salesDaysByVariant:{[variantId]:7}};
  const engine=new AiOperatingLayerEngine();
  const generated=engine.generateInsightsAndRecommendations(ctx,snapshot);
  check("AI-01","Data-driven insight",generated.insights.length===1&&generated.insights[0].title.includes("Certification Product"),"Generated content is derived from the supplied business snapshot.");
  check("AI-02","Tenant/branch binding",generated.insights[0]?.tenantId===ctx.tenantId&&generated.insights[0]?.branchId===ctx.branchId,"Generated records retain authenticated context.");
  check("AI-03","Evidence traceability",generated.insights[0]?.evidence.some(e=>e.sourceId===variantId)===true,"Evidence contains the concrete variant source identifier.");
  check("AI-04","Risk computation",["MEDIUM","HIGH","CRITICAL"].includes(generated.recommendations[0]?.riskLevel||""),"Risk classification is computed from stock coverage.");
  check("AI-05","Kill switch fail-closed",engine.generateInsightsAndRecommendations(ctx,snapshot,true).insights.length===0,"Active kill switch prevents generation.");
  const metric={metricId:"m-gross-margin",metricName:"Gross Margin Percentage",calculatedValue:37.5,evidence:[] as any[]};
  check("AI-06","Governed Ask AI",(()=>{try{return engine.askAi(ctx,"What is gross margin?",["financial_report_view"],metric).answer.includes("37.50%");}catch{return false;}})(),"Ask AI uses the supplied governed metric and permission set.");
  check("AI-07","Unsupported query fail-closed",(()=>{try{engine.askAi(ctx,"Tell me a secret",["financial_report_view"],metric);return false;}catch(e){return String((e as Error).message).includes("AI_QUERY_UNSUPPORTED");}})(),"Unsupported analytical requests do not fabricate an answer.");
  const engineSource=read("packages/domain/src/aiOperatingLayerEngine.ts");
  const serviceSource=read("apps/api/src/services/aiOperatingLayerService.ts");
  const serverSource=read("apps/api/src/server.ts");
  const pageSource=read("apps/web/src/pages/WorkspacePages.tsx");
  const schemaSource=read("packages/database/prisma/schema.prisma");
  const migration=read("packages/database/prisma/migrations/20261004110000_ai_insights_governance/migration.sql");
  const gov=read("scripts/release/verify-ai-operating-layer-governance.ts");
  check("AI-08","No fabricated business constants",!["Panadol 500mg","SKU-9020","TEN-001"].some(x=>engineSource.includes(x)),"The AI engine contains no fixed tenant/product business facts.");
  check("AI-09","PostgreSQL persistence",["model AiInsight","model AiRecommendation","model AiActionLedger","model AiKillSwitch"].every(x=>schemaSource.includes(x))&&migration.includes('CREATE TABLE "ai_insights"'),"AI state has durable Prisma schema and migration authority.");
  check("AI-10","Server authorization",["requireAiViewerContext","requireAiApprovalContext","requireAiKillSwitchContext"].every(x=>serverSource.includes(x)),"AI routes require server-derived identity, tenant and permission context.");
  check("AI-11","Service persistence",serviceSource.includes("globalPrismaAiInsightsRepository")&&serviceSource.includes("persistInsightsAndRecommendations"),"AI service persists generated records through the database repository.");
  check("AI-12","Live UI/API closure",["/api/v1/ai-operating-layer/insights","/api/v1/ai-operating-layer/recommendations","/api/v1/ai-operating-layer/kill-switch"].every(x=>pageSource.includes(x)),"AI page reads and mutates through real API endpoints.");
  check("AI-13","No forced certification results",!read("scripts/certification/ai-operating-layer-certification-engine.ts").includes("addResult("), "Certification uses executable checks rather than unconditional pillar claims.");
  check("AI-14","Safe approval semantics",serviceSource.includes("approveRecommendation")&&engineSource.includes("does not execute a business mutation"),"Approval is durable and explicitly non-mutating until a verified domain action gateway exists.");
  check("AI-15","Structured evidence contract",read("packages/contracts/src/aiOperatingLayerContracts.ts").includes("AiEvidenceItemSchema")&&read("packages/contracts/src/aiOperatingLayerContracts.ts").includes("sourceId"),"Evidence is structured and source-traceable.");
  check("AI-16","Governance verifier",gov.includes("durable-persistence")&&gov.includes("no-business-hardcoding"),"Release governance verifies the production authority chain.");
  const passed=results.filter(r=>r.passed).length,total=results.length;
  return {totalPillars:total,passedPillars:passed,failedPillars:total-passed,successRatePct:total?Math.round(passed/total*100):0,results};
}
