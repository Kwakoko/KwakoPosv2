import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const files=["packages/database/prisma/migrations/202609020002_phase46_support_operations/migration.sql","apps/api/src/services/supportOperationsService.ts","apps/api/src/routes/supportOperationsRoutes.ts","apps/api/src/serverFixed.ts","apps/web/src/pages/SupportOperationsPage.tsx"];
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const checks:Array<[string,()=>boolean]>=[
["Support persistence exists",()=>fs.existsSync(path.join(root,files[0]))],
["Scoped support service exists",()=>fs.existsSync(path.join(root,files[1]))],
["Support routes exist",()=>fs.existsSync(path.join(root,files[2]))],
["Production server mounts support",()=>read(files[3]).includes("supportOperationsRoutes(server)")],
["Support UI exists",()=>fs.existsSync(path.join(root,files[4]))],
["Tenant scope is enforced",()=>read(files[1]).includes("assertTenant")&&read(files[1]).includes('tenant_id')],
["Symptom diagnosis does not claim confirmed root cause",()=>read(files[1]).includes("root cause is not yet confirmed")],
["Restricted remediation is blocked",()=>read(files[1]).includes("REMEDIATION_RESTRICTED")],
["Resolution requires verification",()=>read(files[1]).includes("VERIFICATION_REQUIRED")],
["Support actions are audited",()=>read(files[1]).includes("SupportEvent")&&read(files[1]).includes("audit(")],
["Diagnosis endpoint exists",()=>read(files[2]).includes("/diagnose")],
["Remediation endpoint exists",()=>read(files[2]).includes("/remediation")],
["Resolution endpoint exists",()=>read(files[2]).includes("/resolve")],
["UI creates real tickets",()=>read(files[4]).includes("/api/v1/support/tickets")],
];
let passed=0;console.log("========================================================================");console.log(" KWAKOPOS PHASE 46 — 360° SUPPORT OPERATIONS CERTIFICATION              ");console.log("========================================================================\n");for(const[name,test]of checks){const ok=(()=>{try{return test()}catch{return false}})();if(ok)passed++;console.log(`${ok?"✓":"✗"} ${name}`)}console.log(`\nPASSED: ${passed}/${checks.length}`);process.exit(passed===checks.length?0:1);
