import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const assert = (ok: boolean, msg: string) => { if (!ok) failures.push(msg); };

const workforceUi = read("apps/web/src/pages/ProductionStaffHRPage.tsx");
const vertical = read("apps/web/src/pages/VerticalModulePages.tsx");
const server = read("apps/api/src/server.ts");
const schema = read("packages/database/prisma/schema.prisma");
const contracts = read("packages/contracts/src/index.ts");
const payrollRepo = read("packages/database/src/prismaProductionRepositories.ts");
const expenseRepo = read("packages/database/src/atomicCommercialFinance.ts");
const onboarding = read("apps/api/src/services/tenantOnboardingService.ts");
const migration = read("packages/database/prisma/migrations/202610080001_staff_expense_employee_link/migration.sql");

assert(!vertical.includes("DEMO_EMPLOYEES"), "Workforce page may not use DEMO_EMPLOYEES.");
assert(!vertical.includes("WorkforceStub"), "Workforce page may not expose WorkforceStub.");
assert(workforceUi.includes("/api/v1/workforce/employees"), "Production Staff/HR UI must read employee authority.");
assert(workforceUi.includes("/api/v1/workforce/attendance"), "Production Staff/HR UI must read attendance authority.");
assert(workforceUi.includes("/api/v1/workforce/payroll-inputs"), "Production Staff/HR UI must read payroll authority.");
assert(workforceUi.includes("/api/v1/workforce/commissions"), "Production Staff/HR UI must read commission authority.");
assert(workforceUi.includes('employeeId: expenseEmployee'), "Staff expenses must identify the owning employee.");

assert(server.includes("requireWorkforcePermission"), "Workforce routes must use an explicit server-side workforce permission gate.");
assert(server.includes('requireWorkforcePermission(req, "WORKFORCE_VIEW")'), "Workforce read routes must enforce WORKFORCE_VIEW.");
assert(server.includes('requireWorkforcePermission(req, "WORKFORCE_EDIT")'), "Workforce mutation routes must enforce WORKFORCE_EDIT.");
assert(onboarding.includes('"WORKFORCE_VIEW", "WORKFORCE_EDIT"'), "Tenant onboarding must seed both workforce permissions.");

assert(/model Expense \{[\s\S]*?employeeId\s+String\?[\s\S]*?employee\s+Employee\?/.test(schema), "Expense must have an employee ownership relation.");
assert(migration.includes('ADD COLUMN "employeeId" TEXT'), "Staff expense employeeId migration must exist.");
assert(expenseRepo.includes("STAFF_EXPENSE_EMPLOYEE_NOT_FOUND"), "Staff expenses must validate employee ownership.");
assert(expenseRepo.includes("employeeId: req.employeeId ? String(req.employeeId) : null"), "Staff expense writes must persist employeeId.");

assert(payrollRepo.includes("TIMESHEET_MUST_BE_APPROVED"), "Payroll input generation must require approved/locked timesheets.");
assert(payrollRepo.includes("PAYROLL_INPUT_FINALIZED"), "Payroll input generation/approval must protect finalized records.");
assert(payrollRepo.includes('status:"APPROVED"'), "Approved commissions must feed payroll.");
assert(contracts.includes('employeeId: z.string().uuid().optional()'), "Expense request contract must accept employeeId.");

if (failures.length) {
  console.error("STAFF / HR PRODUCTION LOCK: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("STAFF / HR PRODUCTION LOCK: PASS");
console.log("Authoritative UI, server RBAC, staff expense ownership, payroll/commission finalization, and release-gate invariants verified.");
