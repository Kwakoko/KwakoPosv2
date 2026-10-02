import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";

export interface DashboardKpiSnapshot {
  asOfRevision: string;
  capturedAt: string;
  tenantId: string;
  branchId: string;
  salesToday: number;
  grossProfit: number;
  aov: number;
  todayOrderCount: number;
  completedOrders: number;
  inventoryValue: number;
  stockAlerts: number;
  lowStockCount: number;
  outOfStockCount: number;
  customerDebts: number;
  customerCount: number;
  productCount: number;
  supplierCount: number;
  /** Stable KPI-key map. Missing/NULL values are explicitly unavailable, never fabricated. */
  kpis: Record<string, number | null>;
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof (value as any).toNumber === "function") return (value as any).toNumber();
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * PostgreSQL-authoritative dashboard metrics.
 *
 * All KPI queries execute inside one REPEATABLE READ transaction. The journal
 * head is read inside that same snapshot, so asOfRevision identifies exactly
 * the server state used for every metric returned by this call.
 */
export async function getDashboardKpiSnapshot(ctx: TenantContext): Promise<DashboardKpiSnapshot> {
  if (!ctx?.tenantId || !ctx?.branchId) {
    throw new Error("Authenticated tenant and branch context are required");
  }

  return prisma.$transaction(async (tx) => {
    const revisionRows = await tx.$queryRawUnsafe<Array<{ revision: bigint | number | string | null }>>(
      `SELECT COALESCE(MAX(revision), 0) AS revision
         FROM sync_change_journal
        WHERE tenant_id = $1 AND branch_id = $2`,
      ctx.tenantId,
      ctx.branchId,
    );
    const asOfRevision = String(revisionRows[0]?.revision ?? "0");

    const [salesRows, inventoryRows, stockRows, customerRows, productRows, supplierRows] = await Promise.all([
      tx.$queryRawUnsafe<Array<{ sales_today: unknown; gross_profit: unknown; order_count: bigint | number | string; completed_orders: bigint | number | string }>>(
        `SELECT
           COALESCE(SUM(grand_total) FILTER (WHERE status = 'COMPLETED'), 0) AS sales_today,
           COALESCE(SUM(gross_profit) FILTER (WHERE status = 'COMPLETED'), 0) AS gross_profit,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS order_count,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders
         FROM sales
        WHERE tenant_id = $1
          AND branch_id = $2
          AND sold_at >= CURRENT_DATE
          AND sold_at < CURRENT_DATE + INTERVAL '1 day'`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ inventory_value: unknown }>>(
        `SELECT COALESCE(SUM(stock_value), 0) AS inventory_value
           FROM product_branch_stock
          WHERE tenant_id = $1
            AND branch_id = $2`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ low_stock: bigint | number | string; out_of_stock: bigint | number | string }>>(
        `SELECT
           COUNT(*) FILTER (WHERE pbs.current_quantity > 0 AND pbs.current_quantity <= pv.reorder_level) AS low_stock,
           COUNT(*) FILTER (WHERE pbs.current_quantity <= 0) AS out_of_stock
         FROM product_branch_stock pbs
         JOIN product_variants pv
           ON pv.id = pbs.variant_id
          AND pv.tenant_id = pbs.tenant_id
          AND pv.branch_id = pbs.branch_id
        WHERE pbs.tenant_id = $1
          AND pbs.branch_id = $2
          AND pv.is_active = TRUE`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ customer_debts: unknown; customer_count: bigint | number | string }>>(
        `SELECT
           COALESCE(SUM(current_balance), 0) AS customer_debts,
           COUNT(*) FILTER (WHERE status = 'ACTIVE') AS customer_count
         FROM customers
        WHERE tenant_id = $1
          AND branch_id = $2`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ product_count: bigint | number | string }>>(
        `SELECT COUNT(*) AS product_count
           FROM products
          WHERE tenant_id = $1
            AND branch_id = $2
            AND is_active = TRUE`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ supplier_count: bigint | number | string }>>(
        `SELECT COUNT(*) AS supplier_count
           FROM suppliers
          WHERE tenant_id = $1
            AND branch_id = $2
            AND status = 'ACTIVE'`,
        ctx.tenantId,
        ctx.branchId,
      ),
    ]);

    const sales = salesRows[0] ?? {};
    const inventory = inventoryRows[0] ?? {};
    const stock = stockRows[0] ?? {};
    const customers = customerRows[0] ?? {};

    const salesToday = numberValue(sales.sales_today);
    const orderCount = numberValue(sales.order_count);
    const lowStockCount = numberValue(stock.low_stock);
    const outOfStockCount = numberValue(stock.out_of_stock);

    return {
      asOfRevision,
      capturedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      salesToday,
      grossProfit: numberValue(sales.gross_profit),
      aov: orderCount > 0 ? salesToday / orderCount : 0,
      todayOrderCount: orderCount,
      completedOrders: numberValue(sales.completed_orders),
      inventoryValue: numberValue(inventory.inventory_value),
      stockAlerts: lowStockCount + outOfStockCount,
      lowStockCount,
      outOfStockCount,
      customerDebts: numberValue(customers.customer_debts),
      customerCount: numberValue(customers.customer_count),
      productCount: numberValue(productRows[0]?.product_count),
      supplierCount: numberValue(supplierRows[0]?.supplier_count),
      kpis: {
        SalesToday: salesToday,
        GrossProfitToday: numberValue(sales.gross_profit),
        AovToday: orderCount > 0 ? salesToday / orderCount : 0,
        ProductCount: numberValue(productRows[0]?.product_count),
        StockAlerts: lowStockCount + outOfStockCount,
        CustomerDebts: numberValue(customers.customer_debts),
        InventoryValue: numberValue(inventory.inventory_value),
        CompletedOrders: numberValue(sales.completed_orders),
        LowStock: lowStockCount,
        OutOfStock: outOfStockCount,
        CustomerCount: numberValue(customers.customer_count),
        SupplierCount: numberValue(supplierRows[0]?.supplier_count),

        // Vertical KPIs remain null until an authoritative module service is registered.
        RestaurantActiveService: null,
        RestaurantKitchenQueue: null,
        RestaurantKitchenStatus: null,
        PharmacyPendingRx: null,
        PharmacyNearExpiry: null,
        SaccoDepositsSavings: null,
        SaccoOutstandingLoans: null,
        SaccoInterestEarned: null,
        SaccoMembers: null,
        PoultryAnimals: null,
        PoultryFlocks: null,
        PoultryEggsToday: null,
        PoultryMortalityRate: null,
        ConsultantClients: null,
        ConsultantEngagements: null,
        ConsultantRevenue: null,
        ConsultantUtilization: null,
        ConsultantBillableHours: null,
        ConsultantProposalConversion: null,
        ConsultantUpcomingMeetings: null,
        ConsultantExpiringContracts: null,
      },
    };
  }, { isolationLevel: "RepeatableRead" });
}
