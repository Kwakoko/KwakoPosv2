import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository, PrismaProductionCommercialRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";

describe("Customers / Contacts Production Lock", () => {
  it("closes authoritative lifecycle, money, contacts, audit and convergence", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const otherTenantId = randomUUID();
    const otherBranchId = randomUUID();
    const customerId = randomUUID();
    const contactId = randomUUID();
    const repaymentId = randomUUID();
    const walletDepositId = randomUUID();
    const walletRepaymentId = randomUUID();
    const ctx: any = { tenantId, branchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] };
    const foreignCtx: any = { tenantId: otherTenantId, branchId: otherBranchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] };
    const sync = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const commercial = new PrismaProductionCommercialRepository();

    try {
      await prisma.tenant.createMany({
        data: [
          { id: tenantId, name: "Customer Lock Test", slug: "customer-lock-" + tenantId.slice(0, 8) },
          { id: otherTenantId, name: "Other Tenant", slug: "other-customer-lock-" + otherTenantId.slice(0, 8) },
        ],
      });
      await prisma.branch.createMany({
        data: [
          { id: branchId, tenantId, name: "Main", code: "CUS-LOCK" },
          { id: otherBranchId, tenantId: otherTenantId, name: "Other", code: "OTHER-LOCK" },
        ],
      });

      const create = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-A",
        operations: [{
          operationId: randomUUID(),
          entityType: "Customer",
          entityId: customerId,
          operationType: "CREATE",
          payload: {
            id: customerId,
            customerCode: "CUST-LOCK-001",
            name: "Customer Lock Test",
            phone: "+255710000001",
            email: "customer-lock@example.test",
            openingBalance: 1000,
            creditLimit: 5000,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "customer-create-" + customerId,
        }],
      });
      expect(create.results[0].status).toBe("SUCCESS");

      const contactCreate = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-A",
        operations: [{
          operationId: randomUUID(),
          entityType: "CustomerContact",
          entityId: contactId,
          operationType: "CREATE",
          payload: {
            id: contactId,
            customerId,
            contactCode: "CNT-LOCK-001",
            firstName: "Jane",
            lastName: "Smith",
            roleTitle: "Accounts Payable",
            phone: "+255710000002",
            email: "jane@example.test",
            isPrimary: true,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "contact-create-" + contactId,
        }],
      });
      expect(contactCreate.results[0].status).toBe("SUCCESS");

      const bootstrap: any = await sync.processBootstrap(ctx, { schemaVersion: 7 });
      expect(bootstrap.customers.some((row: any) => row.id === customerId)).toBe(true);
      expect(bootstrap.contacts.some((row: any) => row.id === contactId)).toBe(true);

      const customerBase = (await prisma.customer.findUnique({ where: { id: customerId } }))!.updatedAt;
      const update = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-B",
        operations: [{
          operationId: randomUUID(),
          entityType: "Customer",
          entityId: customerId,
          operationType: "UPDATE",
          payload: {
            name: "Updated Customer Lock Test",
            phone: "+255710000003",
            _baseUpdatedAt: customerBase.toISOString(),
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "customer-update-" + customerId,
        }],
      });
      expect(update.results[0].status).toBe("SUCCESS");

      const contactBase = (await prisma.customerContact.findUnique({ where: { id: contactId } }))!.updatedAt;
      const contactUpdate = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-B",
        operations: [{
          operationId: randomUUID(),
          entityType: "CustomerContact",
          entityId: contactId,
          operationType: "UPDATE",
          payload: {
            roleTitle: "Finance Manager",
            _baseUpdatedAt: contactBase.toISOString(),
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "contact-update-" + contactId,
        }],
      });
      expect(contactUpdate.results[0].status).toBe("SUCCESS");

      const walletDeposit = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-A",
        operations: [{
          operationId: randomUUID(),
          entityType: "Payment",
          entityId: walletDepositId,
          operationType: "CREATE",
          payload: {
            id: walletDepositId,
            customerId,
            amount: 500,
            walletDepositAmount: 500,
            kind: "WALLET_DEPOSIT",
            paymentMethod: "CASH",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "wallet-deposit-" + walletDepositId,
        }],
      });
      expect(walletDeposit.results[0].status).toBe("SUCCESS");

      const repayment = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-B",
        operations: [{
          operationId: randomUUID(),
          entityType: "Payment",
          entityId: repaymentId,
          operationType: "CREATE",
          payload: {
            id: repaymentId,
            customerId,
            amount: 300,
            paymentMethod: "CASH",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "customer-repayment-" + repaymentId,
        }],
      });
      expect(repayment.results[0].status).toBe("SUCCESS");

      const walletRepayment = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-A",
        operations: [{
          operationId: randomUUID(),
          entityType: "Payment",
          entityId: walletRepaymentId,
          operationType: "CREATE",
          payload: {
            id: walletRepaymentId,
            customerId,
            amount: 400,
            payUsingWallet: true,
            paymentMethod: "WALLET",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "wallet-repayment-" + walletRepaymentId,
        }],
      });
      expect(walletRepayment.results[0].status).toBe("SUCCESS");

      const replay = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-A",
        operations: [{
          operationId: repayment.results[0].operationId,
          entityType: "Payment",
          entityId: repaymentId,
          operationType: "CREATE",
          payload: { id: repaymentId, customerId, amount: 300, paymentMethod: "CASH" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "customer-repayment-" + repaymentId,
        }],
      });
      expect(replay.results[0].status).toBe("ALREADY_PROCESSED");

      const saved = await prisma.customer.findUnique({ where: { id: customerId } });
      expect(Number(saved?.currentBalance)).toBe(300);
      expect(Number(saved?.walletBalance)).toBe(100);

      await expect(commercial.getCustomerById(foreignCtx, customerId)).resolves.toBeNull();

      const foreignContact = await sync.processPush(foreignCtx, {
        deviceId: "FOREIGN-DEVICE",
        operations: [{
          operationId: randomUUID(),
          entityType: "CustomerContact",
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: {
            customerId,
            firstName: "Blocked",
            lastName: "Cross Tenant",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "foreign-contact-" + randomUUID(),
        }],
      });
      expect(foreignContact.results[0].status).toBe("FAILED");
      expect(foreignContact.results[0].error).toMatch(/CUSTOMER_NOT_FOUND|TENANT/);

      const txns: any = await commercial.getCustomerTransactions(ctx, customerId);
      expect(txns.sales).toBeDefined();
      expect(txns.payments.length).toBeGreaterThanOrEqual(3);

      const history: any[] = await commercial.getCustomerContactHistory(ctx, contactId);
      expect(history.some((event: any) => event.action === "CUSTOMER_CONTACT_CREATED")).toBe(true);
      expect(history.some((event: any) => event.action === "CUSTOMER_CONTACT_UPDATED")).toBe(true);

      const delta: any = await sync.processDelta(ctx, { since: new Date(Date.now() - 60_000).toISOString() });
      expect(delta.contacts.some((row: any) => row.id === contactId)).toBe(true);

      const archiveBlocked = await sync.processPush(ctx, {
        deviceId: "CUSTOMER-DEVICE-A",
        operations: [{
          operationId: randomUUID(),
          entityType: "Customer",
          entityId: customerId,
          operationType: "DELETE",
          payload: { id: customerId },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "blocked-delete-" + customerId,
        }],
      });
      expect(archiveBlocked.results[0].status).toBe("FAILED");
      expect(archiveBlocked.results[0].error).toMatch(/NONZERO_BALANCE|BALANCE/);

      const audit = await prisma.auditEvent.findMany({
        where: { tenantId, branchId },
        orderBy: { createdAt: "asc" },
      });
      expect(audit.some((row: any) => row.action === "CUSTOMER_CREATED")).toBe(true);
      expect(audit.some((row: any) => row.action === "CUSTOMER_UPDATED")).toBe(true);
      expect(audit.some((row: any) => row.action === "CUSTOMER_CONTACT_CREATED")).toBe(true);
      expect(audit.some((row: any) => row.action === "CUSTOMER_PAYMENT_RECORDED")).toBe(true);
      expect(audit.some((row: any) => row.action === "CUSTOMER_WALLET_DEPOSIT")).toBe(true);
    } finally {
      await prisma.payment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
      await prisma.customerContact.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
      await prisma.syncOperation.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
      await prisma.auditEvent.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
      await prisma.customer.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
      await prisma.branch.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
    }
  });
});
