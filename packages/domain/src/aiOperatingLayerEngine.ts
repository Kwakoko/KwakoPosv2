import { AiBusinessSnapshot,AiEvidenceItem,AiInsightRecord,AiRecommendation,AiRiskLevel,AiSemanticMetricResult,TenantContext } from "@kwakopos2/contracts";

export class AiOperatingLayerEngine {
  public generateInsightsAndRecommendations(ctx:TenantContext,snapshot:AiBusinessSnapshot,killSwitchActive=false){
    if(killSwitchActive)return {insights:[] as AiInsightRecord[],recommendations:[] as AiRecommendation[]};
    const active=snapshot.variants.filter(v=>v.active);
    const atRisk=active.map(v=>{
      const stock=Number(snapshot.stockByVariant[v.variantId]??0);
      const available=Math.max(0,stock-Number(v.reservedQuantity??0));
      const reorder=Number(v.reorderLevel??0);
      const sold7=Number(snapshot.unitsSoldLast7DaysByVariant[v.variantId]??0);
      const days=Number(snapshot.salesDaysByVariant[v.variantId]??0);
      const velocity=sold7/7;
      const projected=velocity>0?available/velocity:null;
      return {v,available,reorder,sold7,days,projected};
    }).filter(r=>r.reorder>0&&r.available<=r.reorder).sort((a,b)=>(a.projected??Infinity)-(b.projected??Infinity));
    if(!atRisk.length){
      return {insights:[{
        insightId:`INS-${ctx.tenantId}-${ctx.branchId}-HEALTH`,tenantId:ctx.tenantId,branchId:ctx.branchId,dedupeKey:"STOCKOUT-HEALTHY",
        title:"No immediate stockout risk detected",observation:`Reviewed ${active.length} active variants against configured reorder levels.`,
        evidence:[{sourceType:"BI_METRIC",sourceId:`stock-risk-scan-${ctx.tenantId}-${ctx.branchId}`,label:"Active variants reviewed",value:active.length,observedAt:snapshot.now,evidenceClass:"MEASURED"}],
        interpretation:"No active variant is currently at or below its configured reorder level.",impact:"No immediate stockout intervention is indicated by the current inventory ledger.",
        recommendedNextStep:"Continue normal stock monitoring.",confidenceScore:0.9,evidenceClass:"CALCULATED",sourceKind:"DETERMINISTIC_RULE",status:"ACTIVE",createdAt:snapshot.now,updatedAt:snapshot.now,
      }],recommendations:[]};
    }
    const insights:AiInsightRecord[]=[]; const recommendations:AiRecommendation[]=[];
    for(const r of atRisk.slice(0,10)){
      const projected=r.projected==null?null:Number(Math.max(0,r.projected).toFixed(2));
      const riskLevel:AiRiskLevel=projected!=null&&projected<1?"CRITICAL":projected!=null&&projected<3?"HIGH":"MEDIUM";
      const evidence:AiEvidenceItem[]=[
        {sourceType:"PRODUCT_VARIANT",sourceId:r.v.variantId,label:"Product variant",value:r.v.sku,observedAt:snapshot.now,evidenceClass:"MEASURED"},
        {sourceType:"STOCK_LEDGER",sourceId:`stock-balance-${r.v.variantId}`,label:"Ledger-derived available stock",value:r.available,observedAt:snapshot.now,evidenceClass:"CALCULATED"},
        {sourceType:"SALE_LINE",sourceId:`sales-7d-${r.v.variantId}`,label:"Units sold in trailing 7 days",value:r.sold7,observedAt:snapshot.now,evidenceClass:"MEASURED"},
      ];
      const velocityText=projected==null?"No positive 7-day sales velocity was observed.":`Projected stock coverage is about ${projected} days at the observed sales velocity.`;
      const confidence=Math.min(0.98,0.70+Math.min(0.28,(r.days/7)*0.28));
      const insightId=`INS-${ctx.tenantId}-${ctx.branchId}-${r.v.variantId}`;
      insights.push({
        insightId,tenantId:ctx.tenantId,branchId:ctx.branchId,dedupeKey:`STOCKOUT-${r.v.variantId}`,
        title:`Stockout risk: ${r.v.productName}`,
        observation:`${r.v.productName} (${r.v.sku}) is at ${r.available} available units versus reorder level ${r.reorder}. ${velocityText}`,
        evidence,interpretation:projected==null?"Inventory is at or below its reorder threshold, but recent demand is insufficient to estimate a stockout date.":`At the observed 7-day sales velocity, available stock covers approximately ${projected} days.`,
        impact:projected==null?"The item requires inventory review because the ledger-derived balance is below the configured reorder point.":`The item may reach zero available stock in approximately ${projected} days if recent demand continues.`,
        recommendedNextStep:`Review replenishment for ${r.v.productName} and confirm supplier availability before creating a purchase order.`,
        confidenceScore:Number(confidence.toFixed(2)),evidenceClass:"CALCULATED",sourceKind:"DETERMINISTIC_RULE",status:"ACTIVE",createdAt:snapshot.now,updatedAt:snapshot.now,
      });
      recommendations.push({
        recommendationId:`REC-${ctx.tenantId}-${ctx.branchId}-${r.v.variantId}`,tenantId:ctx.tenantId,branchId:ctx.branchId,insightId,
        title:`Review replenishment: ${r.v.productName}`,summary:`Available stock is ${r.available} against reorder level ${r.reorder}.`,
        evidence,expectedImpact:"Reduce stockout probability by reviewing replenishment before available stock is exhausted.",
        riskLevel,policyStatus:"VALIDATED",approvalStatus:"PENDING",expiresAt:new Date(Date.now()+48*60*60*1000).toISOString(),createdAt:snapshot.now,updatedAt:snapshot.now,
      });
    }
    return {insights,recommendations};
  }

  public askAi(_ctx:TenantContext,queryText:string,userPermissions:string[],metric:AiSemanticMetricResult){
    const allowed=userPermissions.some(p=>["*","finance_view","financial_report_view","finance.read"].includes(String(p).toLowerCase()));
    if(!allowed)throw new Error("FORBIDDEN: Finance analytical permission required.");
    const q=queryText.trim().toLowerCase();
    if(!q.includes("margin")&&!q.includes("gross profit"))throw new Error("AI_QUERY_UNSUPPORTED: Only governed gross-margin queries are currently enabled.");
    return {answer:`Based on the current tenant and branch financial ledger, Gross Margin Percentage is ${metric.calculatedValue.toFixed(2)}%.`,evidence:metric.evidence,semanticMetricUsed:metric.metricId};
  }

  public explainRecommendation(rec:AiRecommendation){
    return {found:true,explanation:`Recommendation [${rec.title}] is based on tenant/branch-scoped records and structured source evidence. The approval endpoint records approval only; it does not execute a business mutation.`,evidence:rec.evidence};
  }
}
export const globalAiOperatingLayerEngine=new AiOperatingLayerEngine();
