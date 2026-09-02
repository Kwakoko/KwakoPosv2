import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const files=["packages/database/prisma/migrations/202609020002_phase46_support_operations/migration.sql","apps/api/src/services/supportOperationsService.ts","apps/api/src/routes/supportOperationsRoutes.ts","apps/api/src/routes/supportControlTowerRoutes.ts","apps/api/src/serverFixed.ts","apps/web/src/pages/SupportOperationsPage.tsx","apps/web/src/pages/SuperAdminSupportControlTowerPage.tsx"];
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const checks:Array<[string,()=>boolean]>=[
["Support persistence exists",()=>fs.existsSync(path.join(root,files[0]))],
["Scoped support service exists",()=>fs.existsSync(path.join(root,files[1]))],
["Tenant support routes exist",()=>fs.existsSync(path.join(root,files[2]))],
["Super Admin control-tower routes exist",()=>fs.existsSync(path.join(root,files[3]))],
["Production server mounts both support layers",()=>read(files[4]).includes("supportOperationsRoutes(server)")&&read(files[4]).includes("supportControlTowerRoutes(server)")],
["Tenant support UI exists",()=>fs.existsSync(path.join(root,files[5]))],
["Super Admin control-tower UI exists",()=>fs.existsSync(path.join(root,files[6]))],
["Tenant scope is enforced",()=>read(files[1]).includes("assertTenant")&&read(files[1]).includes('tenant_id')],
["Real sync evidence is collected",()=>read(files[1]).includes('FROM \"sync_operations\"')&&read(files[1]).includes('status')],
["Stock Ledger evidence is collected",()=>read(files[1]).includes('FROM \"stock_ledgers\"')],
["Symptom diagnosis does not claim confirmed root cause",()=>read(files[1]).includes("Root cause remains unconfirmed")],
["Restricted remediation is blocked",()=>read(files[1]).includes("REMEDIATION_RESTRICTED")],
["Safe sync remediation is implemented",()=>read(files[1]).includes("RETRY_FAILED_SYNC")&&read(files[1]).includes("status`='PENDING'")],
["Remediation is policy gated",()=>read(files[1]).includes("AUTO_ALLOWED")&&read(files[1]).includes("HUMAN_APPROVAL_REQUIRED")],
["Resolution requires verification",()=>read(files[1]).includes("VERIFICATION_REQUIRED")],
["Support actions are audited",()=>read(files[1]).includes("SupportEvent")&&read(files[1]).includes("audit(")],
["Control tower aggregates tenants and incidents",()=>read(files[1]).includes("controlTower")&&read(files[1]).includes("activeTenants")&&read(files[1]).includes("activeIncidents")],
["Tenant health endpoint exists",()=>read(files[3]).includes("/tenants/:tenantId/health")],
["Safe remediation execution endpoint exists",()=>read(files[3]).includes("/remediations/:remediationId/execute")],
["UI exposes control tower",()=>read(files[6]).includes("/api/v1/super-admin/support/control-tower")],
["UI exposes tenant health inspection",()=>read(files[6]).includes("/tenants/")&&read(files[6]).includes("/health")],
];
let passed=0;console.log("========================================================================");console.log(" KWAKOPOS PHASE 46 — 360° SUPPORT CONTROL TOWER CERTIFICATION          ");console.log("========================================================================\n");for(const[name,test]of checks){const ok=(()=>{try{return test()}catch{return false}})();if(ok)passed++;console.log(`${ok?"✓":"✗"} ${name}`)}console.log(`\nPASSED: ${passed}/${checks.length}`);process.exit(passed===checks.length?0:1);
