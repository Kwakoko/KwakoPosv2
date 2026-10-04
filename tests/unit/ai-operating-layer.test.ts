import { describe, it, expect } from "vitest";
import { AiOperatingLayerEngine } from "@kwakopos2/domain";
import type { AiBusinessSnapshot, TenantContext } from "@kwakopos2/contracts";

const ctx:TenantContext={tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",userId:"33333333-3333-4333-8333-333333333333",roles:["MANAGER"],permissions:["INVENTORY_VIEW","FINANCIAL_REPORT_VIEW","PURCHASE_APPROVE"]};
const snapshot:AiBusinessSnapshot={now:"2026-10-04T10:00:00.000Z",variants:[{variantId:"44444444-4444-4444-8444-444444444444",productId:"55555555-5555-4555-8555-555555555555",productName:"Test Product",sku:"TEST-001",inventoryQuantity:3,reservedQuantity:0,reorderLevel:5,sellingPrice:100,costPrice:60,active:true}],stockByVariant:{"44444444-4444-4444-8444-444444444444":3},unitsSoldLast7DaysByVariant:{"44444444-4444-4444-8444-444444444444":14},salesDaysByVariant:{"44444444-4444-4444-8444-444444444444":7}};

describe("AI Insights Engine — data-grounded behavior",()=>{
  const engine=new AiOperatingLayerEngine();
  it("generates tenant/branch-scoped insight from supplied snapshot",()=>{
    const result=engine.generateInsightsAndRecommendations(ctx,snapshot);
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].tenantId).toBe(ctx.tenantId);
    expect(result.insights[0].branchId).toBe(ctx.branchId);
    expect(result.insights[0].title).toContain("Test Product");
    expect(result.insights[0].observation).toContain("3 available units");
    expect(result.insights[0].evidence.some(e=>e.sourceId===snapshot.variants[0].variantId)).toBe(true);
  });
  it("does not create a reorder recommendation when above reorder level",()=>{
    const healthy={...snapshot,variants:[{...snapshot.variants[0],reorderLevel:2}]};
    const result=engine.generateInsightsAndRecommendations(ctx,healthy);
    expect(result.recommendations).toHaveLength(0);
    expect(result.insights[0].title).toContain("No immediate stockout risk");
  });
  it("uses the supplied governed metric and fails closed on unsupported queries",()=>{
    const metric={metricId:"m-gross-margin",metricName:"Gross Margin Percentage",calculatedValue:37.5,evidence:[]};
    expect(engine.askAi(ctx,"What is gross margin?",["financial_report_view"],metric).answer).toContain("37.50%");
    expect(()=>engine.askAi(ctx,"Tell me everything",["financial_report_view"],metric)).toThrow("AI_QUERY_UNSUPPORTED");
    expect(()=>engine.askAi(ctx,"What is gross margin?",["inventory_view"],metric)).toThrow("FORBIDDEN");
  });
  it("halts generation when the persisted kill-switch state is active",()=>{
    const result=engine.generateInsightsAndRecommendations(ctx,snapshot,true);
    expect(result.insights).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });
});
