import fs from "node:fs";
import path from "node:path";
import { PricingTaxEngine } from "@kwakopos2/domain";

const LOCK_ID = "PRICING-PRODUCTION-LOCK-V1-2026-10-08";

function read(relativePath: string): string {
  const file = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(file)) throw new Error("missing file: " + relativePath);
  return fs.readFileSync(file, "utf8");
}

const failures: string[] = [];

function requireMarkers(name: string, relativePath: string, markers: string[]) {
  try {
    const source = read(relativePath);
    for (const marker of markers) {
      if (!source.includes(marker)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${marker}`);
    }
  } catch (err) {
    failures.push(`READ_FAILURE: ${name}: ${String(err)}`);
  }
}

requireMarkers("pricing-schema", "packages/database/prisma/schema.prisma", [
  "model PriceList {",
  "model PriceListItem {",
  "model CustomerPrice {",
  "model PricingTier {",
  "model PricingPromotion {",
  'customerSegment String?',
  'customerSegment     String?',
]);

requireMarkers("pricing-authority", "packages/database/src/pricingAuthority.ts", [
  "CUSTOMER",
  "PROMOTION",
  "WHOLESALE",
  "BULK",
  "BRANCH",
  "PRICE_LIST",
  "BASE",
  "SALE_PRICE_AUTHORITY_VIOLATION",
  "PRICE_OVERRIDE_REASON_REQUIRED",
  "PROMOTION_STACKING_REQUIRES_EXPLICIT_ORDER",
]);

requireMarkers("atomic-sale-authority", "packages/database/src/atomicCommercialFinance.ts", [
  "PricingAuthority.resolveUnitPrice",
  "pricingEvidence",
  "DISCOUNT_MANAGE_REQUIRED",
  "PricingTaxEngine.calculateSaleTotals",
  "taxConfig,",
  '"SALE_CREATED"',
]);

requireMarkers("retail-route-authority", "apps/api/src/server.ts", [
  'server.post("/api/v1/retail/pos/checkout"',
  'assertSalesAuthority(req, "create")',
  'CreatePosSaleRequestSchema.parse(req.body)',
  'atomicCommercialFinance.createSale(ctx, validated)',
  '"/api/v1/pricing/price-lists"',
  '"/api/v1/pricing/customer-prices"',
  '"/api/v1/pricing/tiers"',
  '"/api/v1/pricing/promotions"',
  'PRICING_MANAGE',
]);

requireMarkers("pricing-contracts", "packages/contracts/src/index.ts", [
  '"PRICING_MANAGE"',
  "customerSegment",
  "priceListId",
  "priceOverrideReason",
]);

requireMarkers("pricing-tests", "tests/unit/pricing-tax-discount.test.ts", [
  "authoritative pricing precedence",
  "DISCOUNT_PERCENT_EXCEEDS_100",
  "CART_DISCOUNT_EXCEEDS_SUBTOTAL",
  "recalculates cart-discount tax interaction for inclusive VAT",
  "recalculates cart-discount tax interaction for exclusive VAT",
]);

requireMarkers("release-gate", "package.json", [
  '"certify:pricing-lock":',
  '"production-release:verify":',
]);

try {
  const precedence = PricingTaxEngine.resolveUnitPrice({
    basePrice: 1000,
    priceListPrice: 1050,
    branchPrice: 1100,
    bulkPrice: 950,
    wholesalePrice: 900,
    promotionalPrice: 850,
    customerPrice: 800,
    costPrice: 600,
    quantity: 10,
  });
  if (precedence !== 800) failures.push(`ENGINE_FAILURE: customer precedence resolved to ${precedence}`);

  const inclusive = PricingTaxEngine.calculateSaleTotals(
    [{ lineTotal: 11800, totalCost: 6000, discountAmount: 0, taxAmount: 1800 }],
    1180,
    { ratePct: 18, isInclusive: true },
  );
  if (inclusive.taxTotal !== 1620 || inclusive.grandTotal !== 10620) {
    failures.push(`ENGINE_FAILURE: inclusive tax interaction ${JSON.stringify(inclusive)}`);
  }

  const exclusive = PricingTaxEngine.calculateSaleTotals(
    [{ lineTotal: 11800, totalCost: 6000, discountAmount: 0, taxAmount: 1800 }],
    1800,
    { ratePct: 18, isInclusive: false },
  );
  if (exclusive.taxTotal !== 1476 || exclusive.grandTotal !== 9676) {
    failures.push(`ENGINE_FAILURE: exclusive tax interaction ${JSON.stringify(exclusive)}`);
  }

  try {
    PricingTaxEngine.calculateDiscount(1000, 1, { type: "PERCENTAGE", value: 101 });
    failures.push("ENGINE_FAILURE: percentage discount >100 was accepted");
  } catch (err: any) {
    if (!String(err?.message || err).includes("DISCOUNT_PERCENT_EXCEEDS_100")) {
      failures.push("ENGINE_FAILURE: wrong error for percentage discount >100");
    }
  }
} catch (err) {
  failures.push(`ENGINE_EXCEPTION: ${String(err)}`);
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length ? "FAIL" : "PASS",
  controls: [
    "Price lists",
    "Customer pricing",
    "Branch pricing",
    "Discounts",
    "Promotions",
    "Bulk pricing",
    "Wholesale pricing",
    "Tax interaction",
    "Pricing authorization",
    "Pricing audit",
  ],
  failures,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));

if (failures.length) {
  process.exit(1);
}

console.log("PRICING PRODUCTION LOCK: PASS — " + LOCK_ID);
import fs from "node:fs";
import path from "node:path";
import { PricingTaxEngine } from "@kwakopos2/domain";

const LOCK_ID = "PRICING-PRODUCTION-LOCK-V1-2026-10-08";

function read(relativePath: string): string {
  const file = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(file)) throw new Error("missing file: " + relativePath);
  return fs.readFileSync(file, "utf8");
}

const failures: string[] = [];

function requireMarkers(name: string, relativePath: string, markers: string[]) {
  try {
    const source = read(relativePath);
    for (const marker of markers) {
      if (!source.includes(marker)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${marker}`);
    }
  } catch (err) {
    failures.push(`READ_FAILURE: ${name}: ${String(err)}`);
  }
}

requireMarkers("pricing-schema", "packages/database/prisma/schema.prisma", [
  "model PriceList {",
  "model PriceListItem {",
  "model CustomerPrice {",
  "model PricingTier {",
  "model PricingPromotion {",
  'customerSegment String?',
  'customerSegment String?',
]);

requireMarkers("pricing-authority", "packages/database/src/pricingAuthority.ts", [
  "CUSTOMER",
  "PROMOTION",
  "WHOLESALE",
  "BULK",
  "BRANCH",
  "PRICE_LIST",
  "BASE",
  "SALE_PRICE_AUTHORITY_VIOLATION",
  "PRICE_OVERRIDE_REASON_REQUIRED",
  "PROMOTION_STACKING_REQUIRES_EXPLICIT_ORDER",
]);

requireMarkers("atomic-sale-authority", "packages/database/src/atomicCommercialFinance.ts", [
  "PricingAuthority.resolveUnitPrice",
  "pricingEvidence",
  "DISCOUNT_MANAGE_REQUIRED",
  "PricingTaxEngine.calculateSaleTotals",
  "taxConfig,",
  '"SALE_CREATED"',
]);

requireMarkers("retail-route-authority", "apps/api/src/server.ts", [
  'server.post("/api/v1/retail/pos/checkout"',
  'assertSalesAuthority(req, "create")',
  'CreatePosSaleRequestSchema.parse(req.body)',
  'atomicCommercialFinance.createSale(ctx, validated)',
  '"/api/v1/pricing/price-lists"',
  '"/api/v1/pricing/customer-prices"',
  '"/api/v1/pricing/tiers"',
  '"/api/v1/pricing/promotions"',
  'PRICING_MANAGE',
]);

requireMarkers("pricing-contracts", "packages/contracts/src/index.ts", [
  '"PRICING_MANAGE"',
  "customerSegment",
  "priceListId",
  "priceOverrideReason",
]);

requireMarkers("pricing-tests", "tests/unit/pricing-tax-discount.test.ts", [
  "authoritative pricing precedence",
  "DISCOUNT_PERCENT_EXCEEDS_100",
  "CART_DISCOUNT_EXCEEDS_SUBTOTAL",
  "recalculates cart-discount tax interaction for inclusive VAT",
  "recalculates cart-discount tax interaction for exclusive VAT",
]);

requireMarkers("release-gate", "package.json", [
  '"certify:pricing-lock":',
  '"production-release:verify":',
]);

try {
  const precedence = PricingTaxEngine.resolveUnitPrice({
    basePrice: 1000,
    priceListPrice: 1050,
    branchPrice: 1100,
    bulkPrice: 950,
    wholesalePrice: 900,
    promotionalPrice: 850,
    customerPrice: 800,
    costPrice: 600,
    quantity: 10,
  });
  if (precedence !== 800) failures.push(`ENGINE_FAILURE: customer precedence resolved to ${precedence}`);

  const inclusive = PricingTaxEngine.calculateSaleTotals(
    [{ lineTotal: 11800, totalCost: 6000, discountAmount: 0, taxAmount: 1800 }],
    1180,
    { ratePct: 18, isInclusive: true },
  );
  if (inclusive.taxTotal !== 1620 || inclusive.grandTotal !== 10620) {
    failures.push(`ENGINE_FAILURE: inclusive tax interaction ${JSON.stringify(inclusive)}`);
  }

  const exclusive = PricingTaxEngine.calculateSaleTotals(
    [{ lineTotal: 11800, totalCost: 6000, discountAmount: 0, taxAmount: 1800 }],
    1800,
    { ratePct: 18, isInclusive: false },
  );
  if (exclusive.taxTotal !== 1476 || exclusive.grandTotal !== 9676) {
    failures.push(`ENGINE_FAILURE: exclusive tax interaction ${JSON.stringify(exclusive)}`);
  }

  try {
    PricingTaxEngine.calculateDiscount(1000, 1, { type: "PERCENTAGE", value: 101 });
    failures.push("ENGINE_FAILURE: percentage discount >100 was accepted");
  } catch (err: any) {
    if (!String(err?.message || err).includes("DISCOUNT_PERCENT_EXCEEDS_100")) {
      failures.push("ENGINE_FAILURE: wrong error for percentage discount >100");
    }
  }
} catch (err) {
  failures.push(`ENGINE_EXCEPTION: ${String(err)}`);
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length ? "FAIL" : "PASS",
  controls: [
    "Price lists",
    "Customer pricing",
    "Branch pricing",
    "Discounts",
    "Promotions",
    "Bulk pricing",
    "Wholesale pricing",
    "Tax interaction",
    "Pricing authorization",
    "Pricing audit",
  ],
  failures,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));

if (failures.length) {
  process.exit(1);
}

console.log("PRICING PRODUCTION LOCK: PASS — " + LOCK_ID);

// PRICING_LOCK_CLOSED_LOOP_RECHECK
