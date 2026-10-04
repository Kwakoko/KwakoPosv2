import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";

export interface DashboardRevenuePoint {
  name: string;
  fullLabel: string;
  Revenue: number;
  Profit: number;
  COGS: number;
  PriorRevenue: number;
  ordersCount: number;
  marginPct: string;
}

export interface DashboardPaymentChannel {
  name: string;
  volume: number;
  count: number;
  paymentCount: number;
  orderCount: number;
  volumeShare: number;
  countShare: number;
  aov: number;
}

export interface DashboardTopProduct {
  productId: string;
  name: string;
  revenue: number;
  units: number;
  stock: number;
  category: string;
  rank: number;
}

export interface DashboardAnalyticsSnapshot {
  timeframe: "today" | "7d" | "30d" | "month";
  chartPoints: DashboardRevenuePoint[];
  totalRevenue: number;
  totalCOGS: number;
  totalProfit: number;
  marginPct: string;
  revenueDeltaPct: string | null;
  profitDeltaPct: string | null;
  priorTotalRevenue: number;
  peakHour: { hour: string; revenue: number; ordersCount: number } | null;
  paymentChannels: DashboardPaymentChannel[];
  paymentTotalVolume: number;
  paymentTotalCount: number;
  paymentTotalOrderCount: number;
  paymentOverallAov: number;
  topProducts: DashboardTopProduct[];
  topProductsTotalTracked: number;
}

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
  grossSalesToday: number;
  discountsToday: number;
  refundsToday: number;
  netSalesToday: number;
  cogsToday: number;
  grossMarginToday: number;
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
  analytics: DashboardAnalyticsSnapshot;
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
export async function getDashboardKpiSnapshot(
  ctx: TenantContext,
  timeframe: DashboardAnalyticsSnapshot["timeframe"] = "7d",
): Promise<DashboardKpiSnapshot> {
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
      tx.$queryRawUnsafe<Array<{ sales_today: unknown; gross_sales_today: unknown; discounts_today: unknown; gross_profit: unknown; cogs_today: unknown; order_count: bigint | number | string; completed_orders: bigint | number | string }>>(
        `SELECT
           COALESCE(SUM("grandTotal" - "taxTotal") FILTER (WHERE "status" = 'COMPLETED'), 0) AS sales_today,
           COALESCE(SUM("grandTotal") FILTER (WHERE "status" = 'COMPLETED'), 0) AS gross_sales_today,
           COALESCE(SUM("discountTotal") FILTER (WHERE "status" = 'COMPLETED'), 0) AS discounts_today,
           COALESCE(SUM(("grandTotal" - "taxTotal") - "totalCost") FILTER (WHERE "status" = 'COMPLETED'), 0) AS gross_profit,
           COALESCE(SUM("totalCost") FILTER (WHERE "status" = 'COMPLETED'), 0) AS cogs_today,
           COUNT(*) FILTER (WHERE "status" = 'COMPLETED') AS order_count,
           COUNT(*) FILTER (WHERE "status" = 'COMPLETED') AS completed_orders
         FROM sales
        WHERE "tenantId" = $1
          AND "branchId" = $2
          AND "soldAt" >= CURRENT_DATE
          AND "soldAt" < CURRENT_DATE + INTERVAL '1 day'`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ inventory_value: unknown }>>(
        `SELECT COALESCE(SUM("stockValue"), 0) AS inventory_value
           FROM product_branch_stock
          WHERE "tenantId" = $1
            AND "branchId" = $2`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ low_stock: bigint | number | string; out_of_stock: bigint | number | string }>>(
        `SELECT
           COUNT(*) FILTER (WHERE pbs."currentQuantity" > 0 AND pbs."currentQuantity" <= pv."reorderLevel") AS low_stock,
           COUNT(*) FILTER (WHERE pbs."currentQuantity" <= 0) AS out_of_stock
         FROM product_branch_stock pbs
         JOIN product_variants pv
           ON pv."id" = pbs."variantId"
          AND pv."tenantId" = pbs."tenantId"
          AND pv."branchId" = pbs."branchId"
        WHERE pbs."tenantId" = $1
          AND pbs."branchId" = $2
          AND pv."isActive" = TRUE`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ customer_debts: unknown; customer_count: bigint | number | string }>>(
        `SELECT
           COALESCE(SUM("currentBalance"), 0) AS customer_debts,
           COUNT(*) FILTER (WHERE "status" = 'ACTIVE') AS customer_count
         FROM customers
        WHERE "tenantId" = $1
          AND "branchId" = $2`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ product_count: bigint | number | string }>>(
        `SELECT COUNT(*) AS product_count
           FROM products
          WHERE "tenantId" = $1
            AND "branchId" = $2
            AND "isActive" = TRUE`,
        ctx.tenantId,
        ctx.branchId,
      ),
      tx.$queryRawUnsafe<Array<{ supplier_count: bigint | number | string }>>(
        `SELECT COUNT(*) AS supplier_count
           FROM suppliers
          WHERE "tenantId" = $1
            AND "branchId" = $2
            AND "status" = 'ACTIVE'`,
        ctx.tenantId,
        ctx.branchId,
      ),
    ]);

    const sales = salesRows[0] ?? {};
    const inventory = inventoryRows[0] ?? {};
    const stock = stockRows[0] ?? {};
    const customers = customerRows[0] ?? {};

    // Dashboard analytics are derived from the same PostgreSQL transaction snapshot
    // as the core KPIs. Browser/IndexedDB state is never used for online analytics.
    const now = new Date();
    const windowDays = timeframe === "today" ? 1 : timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : now.getUTCDate();
    // PostgreSQL DATE("soldAt") is date-based; build the reporting window in UTC
    // so application-local timezone offsets cannot shift the chart day keys.
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (windowDays - 1)));
    const priorStart = new Date(windowStart);
    priorStart.setDate(priorStart.getDate() - windowDays);

    const [dailyRows, returnDailyRows, paymentRows, paymentSummaryRows, topProductRows, hourlyRows] = await Promise.all([
      tx.$queryRawUnsafe<Array<{ day: Date; revenue: unknown; profit: unknown; cogs: unknown; orders_count: bigint | number | string }>>(
        `SELECT DATE("soldAt") AS day,
                COALESCE(SUM("grandTotal" - "taxTotal"),0) AS revenue,
                COALESCE(SUM(("grandTotal" - "taxTotal") - "totalCost"),0) AS profit,
                COALESCE(SUM("totalCost"),0) AS cogs,
                COUNT(*) AS orders_count
           FROM sales
          WHERE "tenantId" = $1 AND "branchId" = $2
            AND "status" = 'COMPLETED'
            AND "soldAt" >= $3
            AND "soldAt" < $4
          GROUP BY DATE("soldAt")
          ORDER BY DATE("soldAt")`,
        ctx.tenantId, ctx.branchId, priorStart, new Date(now.getTime() + 86400000),
      ),
      tx.$queryRawUnsafe<Array<{ day: Date; refund_net: unknown; returned_cogs: unknown }>>(
        `SELECT DATE(r."createdAt") AS day,
                COALESCE(SUM(r."totalRefundAmount" * CASE
                  WHEN s."grandTotal" > 0 THEN 1 - (s."taxTotal" / s."grandTotal")
                  ELSE 1 END),0) AS refund_net,
                COALESCE(SUM((
                  SELECT COALESCE(SUM(rl."quantityReturned" * pv."costPrice"),0)
                    FROM return_lines rl
                    JOIN product_variants pv ON pv."id" = rl."variantId"
                   WHERE rl."returnId" = r."id"
                )),0) AS returned_cogs
           FROM returns r
           LEFT JOIN sales s ON s."id" = r."originalSaleId"
          WHERE r."tenantId" = $1 AND r."branchId" = $2 AND r."status" = 'COMPLETED'
            AND r."createdAt" >= $3 AND r."createdAt" < $4
          GROUP BY DATE(r."createdAt")
          ORDER BY DATE(r."createdAt")`,
        ctx.tenantId, ctx.branchId, priorStart, new Date(now.getTime() + 86400000),
      ),
      tx.$queryRawUnsafe<Array<{ paymentMethod: string; volume: unknown; count: bigint | number | string; order_count: bigint | number | string }>>(
        `SELECT COALESCE(p."paymentMethod", 'CASH') AS paymentMethod,
                COALESCE(SUM(p."amount"),0) AS volume,
                COUNT(*) AS count,
                COUNT(DISTINCT p."saleId") AS order_count
           FROM payments p
           JOIN sales s ON s."id" = p."saleId"
          WHERE p."tenantId" = $1 AND p."branchId" = $2
            AND p."status" = 'COMPLETED' AND s."status" = 'COMPLETED'
            AND s."soldAt" >= $3 AND s."soldAt" < $4
          GROUP BY COALESCE(p."paymentMethod", 'CASH')
          ORDER BY volume DESC`,
        ctx.tenantId, ctx.branchId, windowStart, new Date(now.getTime() + 86400000),
      ),
      tx.$queryRawUnsafe<Array<{ total_volume: unknown; payment_count: bigint | number | string; order_count: bigint | number | string }>>(
        `SELECT COALESCE(SUM(p."amount"),0) AS total_volume,
                COUNT(*) AS payment_count,
                COUNT(DISTINCT p."saleId") AS order_count
           FROM payments p
           JOIN sales s ON s."id" = p."saleId"
          WHERE p."tenantId" = $1 AND p."branchId" = $2
            AND p."status" = 'COMPLETED' AND s."status" = 'COMPLETED'
            AND s."soldAt" >= $3 AND s."soldAt" < $4`,
        ctx.tenantId, ctx.branchId, windowStart, new Date(now.getTime() + 86400000),
      ),      tx.$queryRawUnsafe<Array<{ product_id: string; name: string; revenue: unknown; units: unknown; stock: unknown; category: string }>>(
        `WITH sold AS (
           SELECT sl."productId", sl."variantId",
                  COALESCE(SUM(sl."lineTotal" - sl."taxAmount"),0) AS revenue,
                  COALESCE(SUM(sl."quantity"),0) AS units
             FROM sale_lines sl
             JOIN sales s ON s."id" = sl."saleId"
            WHERE s."tenantId" = $1 AND s."branchId" = $2 AND s."status" = 'COMPLETED'
              AND s."soldAt" >= $3 AND s."soldAt" < $4
            GROUP BY sl."productId", sl."variantId"
         ), returns_by_variant AS (
           SELECT rl."variantId",
                  COALESCE(SUM(rl."refundLineTotal" * CASE
                    WHEN s."grandTotal" > 0 THEN 1 - (s."taxTotal" / s."grandTotal")
                    ELSE 1 END),0) AS refund_revenue,
                  COALESCE(SUM(rl."quantityReturned"),0) AS refund_units
             FROM return_lines rl
             JOIN returns r ON r."id" = rl."returnId"
             LEFT JOIN sales s ON s."id" = r."originalSaleId"
            WHERE r."tenantId" = $1 AND r."branchId" = $2 AND r."status" = 'COMPLETED'
              AND r."createdAt" >= $3 AND r."createdAt" < $4
            GROUP BY rl."variantId"
         )
        SELECT sold."productId", p."name",
               COALESCE(SUM(sold.revenue),0) - COALESCE(SUM(rbv.refund_revenue),0) AS revenue,
               GREATEST(0, COALESCE(SUM(sold.units),0) - COALESCE(SUM(rbv.refund_units),0)) AS units,
               COALESCE((SELECT SUM(pbs."currentQuantity") FROM product_branch_stock pbs
                          WHERE pbs."tenantId" = $1 AND pbs."branchId" = $2
                            AND pbs."productId" = sold."productId"),0) AS stock,
               COALESCE(p.category,'General') AS category
          FROM sold
          JOIN products p ON p."id" = sold."productId"
          LEFT JOIN returns_by_variant rbv ON rbv."variantId" = sold."variantId"
         GROUP BY sold."productId", p."name", p.category
        HAVING (COALESCE(SUM(sold.revenue),0) - COALESCE(SUM(rbv.refund_revenue),0)) > 0
            OR (COALESCE(SUM(sold.units),0) - COALESCE(SUM(rbv.refund_units),0)) > 0
         ORDER BY revenue DESC
         LIMIT 20` ,
        ctx.tenantId, ctx.branchId, windowStart, new Date(now.getTime() + 86400000),
      ),
      tx.$queryRawUnsafe<Array<{ hour: number; revenue: unknown; orders_count: bigint | number | string }>>(
        `SELECT EXTRACT(HOUR FROM "soldAt")::int AS hour,
                COALESCE(SUM("grandTotal" - "taxTotal"),0) AS revenue,
                COUNT(*) AS orders_count
           FROM sales
          WHERE "tenantId" = $1 AND "branchId" = $2
            AND "status" = 'COMPLETED'
            AND "soldAt" >= $3 AND "soldAt" < $4
          GROUP BY EXTRACT(HOUR FROM "soldAt")::int
          ORDER BY revenue DESC
          LIMIT 1`,
        ctx.tenantId, ctx.branchId, windowStart, new Date(now.getTime() + 86400000),
      ),
    ]);

    const dayMap = new Map(dailyRows.map(r => [new Date(r.day).toISOString().slice(0,10), r]));
    const returnDayMap = new Map(returnDailyRows.map(r => [new Date(r.day).toISOString().slice(0,10), r]));
    const priorDayMap = new Map(dailyRows.filter(r => new Date(r.day) < windowStart).map(r => [new Date(r.day).toISOString().slice(0,10), r]));
    const priorReturnDayMap = new Map(returnDailyRows.filter(r => new Date(r.day) < windowStart).map(r => [new Date(r.day).toISOString().slice(0,10), r]));
    const chartPoints: DashboardRevenuePoint[] = [];
    let totalRevenue = 0, totalCOGS = 0, totalProfit = 0, priorTotalRevenue = 0, priorTotalProfit = 0;
    for (let i = 0; i < windowDays; i++) {
      const d = new Date(windowStart); d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0,10);
      const row = dayMap.get(key);
      const prior = new Date(d); prior.setDate(prior.getDate() - windowDays);
      const priorRow = priorDayMap.get(prior.toISOString().slice(0,10));
      const returned = returnDayMap.get(key);
      const priorReturned = priorReturnDayMap.get(prior.toISOString().slice(0,10));
      const revenue = numberValue(row?.revenue) - numberValue(returned?.refund_net);
      const cogs = Math.max(0, numberValue(row?.cogs) - numberValue(returned?.returned_cogs));
      const profit = revenue - cogs;
      const priorRevenue = numberValue(priorRow?.revenue) - numberValue(priorReturned?.refund_net);
      const priorCogs = Math.max(0, numberValue(priorRow?.cogs) - numberValue(priorReturned?.returned_cogs));
      const priorProfit = priorRevenue - priorCogs;
      totalRevenue += revenue; totalCOGS += cogs; totalProfit += profit;
      priorTotalRevenue += priorRevenue; priorTotalProfit += priorProfit;
      chartPoints.push({
        name: timeframe === "today" ? "Today" : timeframe === "month" ? String(d.getDate()) : `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`,
        fullLabel: d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }),
        Revenue: revenue, Profit: profit, COGS: cogs, PriorRevenue: priorRevenue,
        ordersCount: numberValue(row?.orders_count),
        marginPct: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0.0",
      });
    }
    const paymentTotalVolume = paymentRows.reduce((n,r)=>n+numberValue(r.volume),0);
    const paymentTotalCount = paymentRows.reduce((n,r)=>n+numberValue(r.count),0);
    const paymentTotalOrderCount = numberValue(paymentSummaryRows[0]?.order_count);
    const paymentChannels = paymentRows.map(r => {
      const volume = numberValue(r.volume);
      const count = numberValue(r.count);
      const orderCount = numberValue(r.order_count);
      return {
        name: r.paymentMethod, volume, count, paymentCount: count, orderCount,
        volumeShare: paymentTotalVolume > 0 ? Math.round(volume/paymentTotalVolume*100) : 0,
        countShare: paymentTotalCount > 0 ? Math.round(count/paymentTotalCount*100) : 0,
        aov: orderCount > 0 ? Math.round(volume/orderCount) : 0,
      };
    });
    const topProductsTotalTracked = topProductRows.length;
    const maxRevenue = Math.max(...topProductRows.map(r=>numberValue(r.revenue)),1);
    const maxUnits = Math.max(...topProductRows.map(r=>numberValue(r.units)),1);
    const topProducts = topProductRows.slice(0,5).map((r,i)=>({
      productId:r.product_id, name:r.name, revenue:numberValue(r.revenue), units:numberValue(r.units),
      stock:numberValue(r.stock), category:r.category || "General", rank:i+1,
    }));
    const peak = hourlyRows[0];
    const analytics: DashboardAnalyticsSnapshot = {
      timeframe, chartPoints, totalRevenue, totalCOGS, totalProfit,
      marginPct: totalRevenue > 0 ? ((totalProfit/totalRevenue)*100).toFixed(1) : "0.0",
      revenueDeltaPct: priorTotalRevenue > 0 ? (((totalRevenue-priorTotalRevenue)/priorTotalRevenue)*100).toFixed(1) : null,
      profitDeltaPct: priorTotalProfit > 0 ? (((totalProfit-priorTotalProfit)/priorTotalProfit)*100).toFixed(1) : null,
      priorTotalRevenue,
      peakHour: peak ? { hour: `${String(Number(peak.hour)).padStart(2,"0")}:00`, revenue:numberValue(peak.revenue), ordersCount:numberValue(peak.orders_count) } : null,
      paymentChannels, paymentTotalVolume, paymentTotalCount, paymentTotalOrderCount,
      paymentOverallAov: paymentTotalOrderCount > 0 ? Math.round(paymentTotalVolume/paymentTotalOrderCount) : 0,
      topProducts, topProductsTotalTracked,
    };

    const refundRows = await tx.$queryRawUnsafe<Array<{ refunds_today: unknown; net_refunds_today: unknown; returned_cogs_today: unknown }>>(
      `SELECT COALESCE(SUM(r."totalRefundAmount"),0) AS refunds_today,
              COALESCE(SUM(r."totalRefundAmount" * CASE
                WHEN s."grandTotal" > 0 THEN 1 - (s."taxTotal" / s."grandTotal")
                ELSE 1 END),0) AS net_refunds_today,
              COALESCE(SUM(rl."quantityReturned" * pv."costPrice"),0) AS returned_cogs_today
         FROM returns r
         LEFT JOIN sales s ON s."id" = r."originalSaleId"
         LEFT JOIN return_lines rl ON rl."returnId" = r.id
         LEFT JOIN product_variants pv ON pv."id" = rl."variantId"
        WHERE r."tenantId" = $1 AND r."branchId" = $2
          AND r."status" = 'COMPLETED'
          AND r."createdAt" >= CURRENT_DATE
          AND r."createdAt" < CURRENT_DATE + INTERVAL '1 day'`,
      ctx.tenantId, ctx.branchId,
    );
    const refundsToday = numberValue(refundRows[0]?.refunds_today);
    const netRefundsToday = numberValue(refundRows[0]?.net_refunds_today);
    const returnedCogsToday = numberValue(refundRows[0]?.returned_cogs_today);
    const grossSalesToday = numberValue(sales.gross_sales_today);
    const discountsToday = numberValue(sales.discounts_today);
    const grossRevenueToday = numberValue(sales.sales_today);
    const cogsBeforeReturnsToday = numberValue(sales.cogs_today);
    const salesToday = grossRevenueToday - netRefundsToday;
    const cogsToday = Math.max(0, cogsBeforeReturnsToday - returnedCogsToday);
    const grossProfitToday = salesToday - cogsToday;
    const orderCount = numberValue(sales.order_count);
    const lowStockCount = numberValue(stock.low_stock);
    const outOfStockCount = numberValue(stock.out_of_stock);

    return {
      asOfRevision,
      capturedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      salesToday,
      grossProfit: grossProfitToday,
      grossSalesToday,
      discountsToday,
      refundsToday,
      netSalesToday: salesToday,
      cogsToday,
      grossMarginToday: salesToday > 0 ? (grossProfitToday / salesToday) * 100 : 0,
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
      analytics,
      kpis: {
        SalesToday: salesToday,
        GrossProfitToday: grossProfitToday,
        GrossSalesToday: grossSalesToday,
        DiscountsToday: discountsToday,
        RefundsToday: refundsToday,
        NetSalesToday: salesToday,
        CogsToday: cogsToday,
        GrossMarginToday: salesToday > 0 ? (grossProfitToday / salesToday) * 100 : 0,
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
