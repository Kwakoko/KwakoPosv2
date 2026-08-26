import { describe, it, expect, beforeEach } from "vitest";
import { EmployeeEngine } from "@kwakopos2/domain";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Employee Master & Employment History Engine", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["HR_ADMIN"],
    permissions: ["WORKFORCE_VIEW", "EMPLOYEE_CREATE", "EMPLOYEE_EDIT"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("creates employee with automatic sequential employee numbering and initial HIRE history record", () => {
    const { employee, initialRecord } = repo.createEmployee(ctx, {
      firstName: "John",
      lastName: "Doe",
      phone: "+255711223344",
      email: "john@example.com",
      workType: "FULL_TIME",
      contractType: "PERMANENT",
      baseSalary: 1200000,
      pinCode: "1234",
    });

    expect(employee.employeeNumber).toBe("EMP-0001");
    expect(employee.status).toBe("ACTIVE");
    expect(employee.pinCodeHash).toBeTruthy();
    expect(EmployeeEngine.verifyPin("1234", employee.pinCodeHash)).toBe(true);
    expect(EmployeeEngine.verifyPin("9999", employee.pinCodeHash)).toBe(false);

    expect(initialRecord.changeType).toBe("HIRE");
    expect(initialRecord.employeeId).toBe(employee.id);
  });

  it("updates employee salary and generates an audited PAY_ADJUSTMENT employment record", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Jane",
      lastName: "Smith",
      baseSalary: 1000000,
    });

    const updated = repo.updateEmployee(
      ctx,
      employee.id,
      {
        baseSalary: 1350000,
      },
      "Annual merit increase"
    );

    expect(updated.baseSalary).toBe(1350000);
    const history = repo.getEmploymentHistory(ctx, employee.id);
    expect(history.length).toBe(2);
    expect(history[1].changeType).toBe("PAY_ADJUSTMENT");
    expect(history[1].payRate).toBe(1350000);
    expect(history[1].reason).toBe("Annual merit increase");
  });
});
