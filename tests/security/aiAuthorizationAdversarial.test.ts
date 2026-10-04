import { describe, it, expect } from "vitest";
import { AiOperatingLayerEngine } from "@kwakopos2/domain";
import type { AiBusinessSnapshot, TenantContext } from "@kwakopos2/contracts";

const tenantA:TenantContext={tenantId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",branchId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",userId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",roles:["MANAGER"],permissions:["INVENTORY_VIEW","PURCHASE_APPROVE"]};
const tenantB:TenantContext={tenantId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",branchId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",userId:"ffffffff-ffff-4fff-8fff-ffffffffffff",roles:["MANAGER"],permissions:["INVENTORY_VIEW","PURCHASE_APPROVE"]};
const snapshot:AiBusinessSnapshot={now:"2026-10-04T10:00:00.000Z",variants:[{variantId:"99999999-9999-4999-8999-999999999999",productId:"12121212-1212-4212-8212-121212121212",productName:"Tenant A Product",sku:"A-001",inventoryQuantity:1,reservedQuantity:0,reorderLevel:4,sellingPrice:10,costPrice:5,active:true}],stockByVariant:{"99999999-9999-4999-8999-999999999999":1},unitsSoldLast7DaysByVariant:{"99999999-9999-4999-8999-999999999999":7},salesDaysByVariant:{"99999999-9999-4999-8999-999999999999":7}};

describe("AI authorization and evidence-boundary invariants",()=>{
  const engine=new AiOperatingLayerEngine();
  it("binds generated records to supplied tenant context",()=>{
    const result=engine.generateInsightsAndRecommendations(tenantA,snapshot);
    expect(result.insights[0].tenantId).toBe(tenantA.tenantId);
    expect(result.insights[0].tenantId).not.toBe(tenantB.tenantId);
  });
  it("cannot synthesize another tenant's business data",()=>{
    const result=engine.generateInsightsAndRecommendations(tenantB,{...snapshot,variants:[{...snapshot.variants[0],productName:"Tenant B Product"}]});
    expect(result.insights[0].observation).toContain("Tenant B Product");
    expect(result.insights[0].observation).not.toContain("Tenant A Product");
  });
  it("never represents approval as execution of a business mutation",()=>{
    const result=engine.generateInsightsAndRecommendations(tenantA,snapshot);
    expect(engine.explainRecommendation(result.recommendations[0]).explanation).toContain("does not execute a business mutation");
  });
});
