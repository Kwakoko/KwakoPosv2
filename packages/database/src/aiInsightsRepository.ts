import type { AiActionLedgerRecord,AiBusinessSnapshot,AiEvidenceItem,AiInsightRecord,AiOperatingHealthSummary,AiRecommendation,AiSemanticMetricResult,TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { setRlsTenantContext } from "./rlsContext.js";

export class PrismaAiInsightsRepository {
  private async tx<T>(ctx:TenantContext,work:(tx:any)=>Promise<T>):Promise<T>{
    return prisma.$transaction(async transaction=>{await setRlsTenantContext(transaction as any,ctx);return work(transaction);});
  }
  async loadBusinessSnapshot(ctx:TenantContext):Promise<AiBusinessSnapshot>{
    return this.tx(ctx,async tx=>{
      const now=new Date(), since=new Date(now.getTime()-7*24*60*60*1000);
      const variants=await tx.productVariant.findMany({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,isActive:true},select:{id:true,productId:true,name:true,sku:true,inventoryQuantity:true,reservedQuantity:true,reorderLevel:true,price:true,costPrice:true,product:{select:{name:true}}}});
      const ledgerGroups=await tx.stockLedger.groupBy({by:["variantId"],where:{tenantId:ctx.tenantId,branchId:ctx.branchId,occurredAt:{lte:now}},_sum:{quantityChange:true}});
      const sales=await tx.saleLine.findMany({where:{sale:{tenantId:ctx.tenantId,branchId:ctx.branchId,status:"COMPLETED",soldAt:{gte:since}}},select:{variantId:true,quantity:true,sale:{select:{soldAt:true}}}});
      const stockByVariant:Record<string,number>={}; ledgerGroups.forEach((r:any)=>{stockByVariant[r.variantId]=Number(r._sum.quantityChange??0);});
      const unitsSoldLast7DaysByVariant:Record<string,number>={}; const dates=new Map<string,Set<string>>();
      sales.forEach((r:any)=>{unitsSoldLast7DaysByVariant[r.variantId]=(unitsSoldLast7DaysByVariant[r.variantId]??0)+Number(r.quantity??0);const set=dates.get(r.variantId)??new Set<string>();set.add(new Date(r.sale.soldAt).toISOString().slice(0,10));dates.set(r.variantId,set);});
      const salesDaysByVariant:Record<string,number>={};dates.forEach((v,k)=>{salesDaysByVariant[k]=v.size;});
      return {now:now.toISOString(),variants:variants.map((v:any)=>({variantId:v.id,productId:v.productId,productName:v.product?.name||v.name,sku:v.sku,inventoryQuantity:Number(v.inventoryQuantity??0),reservedQuantity:Number(v.reservedQuantity??0),reorderLevel:Number(v.reorderLevel??0),sellingPrice:Number(v.price??0),costPrice:Number(v.costPrice??0),active:Boolean(v.isActive)})),stockByVariant,unitsSoldLast7DaysByVariant,salesDaysByVariant};
    });
  }
  async getGrossMarginMetric(ctx:TenantContext):Promise<AiSemanticMetricResult>{
    return this.tx(ctx,async tx=>{
      const result=await tx.sale.aggregate({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,status:"COMPLETED"},_sum:{grandTotal:true,grossProfit:true}});
      const sales=Number(result._sum.grandTotal??0),grossProfit=Number(result._sum.grossProfit??0),margin=sales>0?(grossProfit/sales)*100:0,observedAt=new Date().toISOString();
      return {metricId:"m-gross-margin",metricName:"Gross Margin Percentage",calculatedValue:Number(margin.toFixed(2)),evidence:[
        {sourceType:"BI_METRIC",sourceId:"m-gross-margin",label:"Completed sales revenue",value:sales,observedAt,evidenceClass:"CALCULATED"},
        {sourceType:"BI_METRIC",sourceId:"m-gross-margin-gross-profit",label:"Completed gross profit",value:grossProfit,observedAt,evidenceClass:"CALCULATED"},
      ]};
    });
  }
  async persistInsightsAndRecommendations(ctx:TenantContext,result:{insights:AiInsightRecord[];recommendations:AiRecommendation[]}){
    await this.tx(ctx,async tx=>{
      const persisted=new Map<string,string>();
      for(const insight of result.insights){
        const row=await tx.aiInsight.upsert({where:{tenantId_branchId_dedupeKey:{tenantId:ctx.tenantId,branchId:ctx.branchId,dedupeKey:insight.dedupeKey}},create:{id:insight.insightId,tenantId:ctx.tenantId,branchId:ctx.branchId,dedupeKey:insight.dedupeKey,title:insight.title,observation:insight.observation,evidence:insight.evidence as any,interpretation:insight.interpretation,impact:insight.impact,recommendedNextStep:insight.recommendedNextStep,confidenceScore:insight.confidenceScore,evidenceClass:insight.evidenceClass,sourceKind:insight.sourceKind,sourceMetricId:insight.sourceMetricId,status:insight.status},update:{title:insight.title,observation:insight.observation,evidence:insight.evidence as any,interpretation:insight.interpretation,impact:insight.impact,recommendedNextStep:insight.recommendedNextStep,confidenceScore:insight.confidenceScore,evidenceClass:insight.evidenceClass,sourceKind:insight.sourceKind,sourceMetricId:insight.sourceMetricId,status:insight.status}});
        persisted.set(insight.insightId,row.id);
      }
      for(const rec of result.recommendations){
        const insightId=rec.insightId?persisted.get(rec.insightId)||rec.insightId:null;
        const existing=await tx.aiRecommendation.findFirst({where:{id:rec.recommendationId,tenantId:ctx.tenantId,branchId:ctx.branchId}});
        if(existing){if(existing.approvalStatus==="PENDING")await tx.aiRecommendation.update({where:{id:existing.id},data:{insightId,title:rec.title,summary:rec.summary,evidence:rec.evidence as any,expectedImpact:rec.expectedImpact,riskLevel:rec.riskLevel,policyStatus:rec.policyStatus,expiresAt:rec.expiresAt?new Date(rec.expiresAt):undefined}});}
        else{await tx.aiRecommendation.create({data:{id:rec.recommendationId,tenantId:ctx.tenantId,branchId:ctx.branchId,insightId,title:rec.title,summary:rec.summary,evidence:rec.evidence as any,expectedImpact:rec.expectedImpact,riskLevel:rec.riskLevel,policyStatus:rec.policyStatus,approvalStatus:"PENDING",expiresAt:rec.expiresAt?new Date(rec.expiresAt):null}});await tx.aiActionLedger.create({data:{tenantId:ctx.tenantId,branchId:ctx.branchId,recommendationId:rec.recommendationId,eventType:"CREATED",actionExecuted:"NONE",executedByIdentity:ctx.userId,executionVerified:false,verificationDetails:"Recommendation created from persisted tenant-scoped insight evidence.",timestamp:new Date()}});}
      }
    });
  }
  private mapInsight(r:any):AiInsightRecord{return {insightId:r.id,tenantId:r.tenantId,branchId:r.branchId,dedupeKey:r.dedupeKey,title:r.title,observation:r.observation,evidence:r.evidence as AiEvidenceItem[],interpretation:r.interpretation,impact:r.impact,recommendedNextStep:r.recommendedNextStep,confidenceScore:Number(r.confidenceScore),evidenceClass:r.evidenceClass,sourceKind:r.sourceKind,sourceMetricId:r.sourceMetricId??undefined,status:r.status,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()};}
  private mapRecommendation(r:any):AiRecommendation{return {recommendationId:r.id,tenantId:r.tenantId,branchId:r.branchId,insightId:r.insightId??undefined,title:r.title,summary:r.summary,evidence:r.evidence as AiEvidenceItem[],expectedImpact:r.expectedImpact,riskLevel:r.riskLevel,policyStatus:r.policyStatus,approvalStatus:r.approvalStatus,approvedByUserId:r.approvedByUserId??undefined,approvedAt:r.approvedAt?.toISOString(),expiresAt:r.expiresAt?.toISOString(),createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()};}
  async listInsights(ctx:TenantContext,limit=50){return this.tx(ctx,async tx=>(await tx.aiInsight.findMany({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,status:"ACTIVE"},orderBy:{createdAt:"desc"},take:Math.min(Math.max(limit,1),100)})).map((r:any)=>this.mapInsight(r)));}
  async listRecommendations(ctx:TenantContext,limit=50){return this.tx(ctx,async tx=>(await tx.aiRecommendation.findMany({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,approvalStatus:{in:["PENDING","APPROVED"]}},orderBy:{createdAt:"desc"},take:Math.min(Math.max(limit,1),100)})).map((r:any)=>this.mapRecommendation(r)));}
  async findRecommendation(ctx:TenantContext,id:string){return this.tx(ctx,async tx=>{const r=await tx.aiRecommendation.findFirst({where:{id,tenantId:ctx.tenantId,branchId:ctx.branchId}});if(!r)throw new Error("NOT_FOUND: AI recommendation not found.");return this.mapRecommendation(r);});}
  async approveRecommendation(ctx:TenantContext,id:string,comments?:string){
    return this.tx(ctx,async tx=>{
      const r=await tx.aiRecommendation.findFirst({where:{id,tenantId:ctx.tenantId,branchId:ctx.branchId}});
      if(!r)throw new Error("NOT_FOUND: AI recommendation not found.");
      if(r.approvalStatus!=="PENDING")throw new Error("AI_APPROVAL_STATE_INVALID: Only pending recommendations may be approved.");
      if(r.policyStatus!=="VALIDATED")throw new Error("AI_POLICY_REJECTED: Recommendation has not passed deterministic policy validation.");
      if(r.expiresAt&&r.expiresAt<new Date())throw new Error("AI_RECOMMENDATION_EXPIRED: Recommendation is stale and must be regenerated.");
      const at=new Date();
      const updated=await tx.aiRecommendation.update({where:{id:r.id},data:{approvalStatus:"APPROVED",approvedByUserId:ctx.userId,approvedAt:at}});
      await tx.aiActionLedger.create({data:{tenantId:ctx.tenantId,branchId:ctx.branchId,recommendationId:r.id,eventType:"APPROVED",actionExecuted:"NONE",executedByIdentity:ctx.userId,executionVerified:false,verificationDetails:comments?.trim()?"Approval recorded. "+comments.trim()+" No business mutation was executed by this endpoint.":"Approval recorded. No business mutation was executed by this endpoint.",timestamp:at}});
      await tx.auditEvent.create({data:{tenantId:ctx.tenantId,branchId:ctx.branchId,userId:ctx.userId,deviceId:"AI_API",action:"AI_RECOMMENDATION_APPROVED",entityType:"AiRecommendation",entityId:r.id,metadata:{riskLevel:r.riskLevel,comments:comments?.trim()||null},createdAt:at}});
      return this.mapRecommendation(updated);
    });
  }
  async getKillSwitchActive(ctx:TenantContext){return this.tx(ctx,async tx=>(await tx.aiKillSwitch.findMany({where:{OR:[{id:"AI-KILL-GLOBAL",isActive:true},{id:`AI-KILL-TENANT-${ctx.tenantId}`,isActive:true}]}})).length>0);}
  async setKillSwitch(ctx:TenantContext,scope:"GLOBAL"|"TENANT",targetId:string,enabled:boolean){
    return this.tx(ctx,async tx=>{
      const id=scope==="GLOBAL"?"AI-KILL-GLOBAL":"AI-KILL-TENANT-"+ctx.tenantId,at=new Date();
      await tx.aiKillSwitch.upsert({where:{id},create:{id,scope,targetId:targetId||(scope==="GLOBAL"?"GLOBAL":ctx.tenantId),tenantId:scope==="GLOBAL"?null:ctx.tenantId,isActive:enabled,triggeredBy:ctx.userId,triggeredAt:at},update:{scope,targetId:targetId||(scope==="GLOBAL"?"GLOBAL":ctx.tenantId),tenantId:scope==="GLOBAL"?null:ctx.tenantId,isActive:enabled,triggeredBy:ctx.userId,triggeredAt:at}});
      await tx.auditEvent.create({data:{tenantId:ctx.tenantId,branchId:ctx.branchId,userId:ctx.userId,deviceId:"AI_API",action:enabled?"AI_KILL_SWITCH_ENABLED":"AI_KILL_SWITCH_DISABLED",entityType:"AiKillSwitch",entityId:id,metadata:{scope,targetId:targetId||null},createdAt:at}});
      return enabled;
    });
  }
  async getHealth(ctx:TenantContext):Promise<AiOperatingHealthSummary>{return this.tx(ctx,async tx=>{const [activeInsightsCount,pendingApprovalsCount,approvedRecommendationsCount,ledgerEntriesCount,kills]=await Promise.all([
    tx.aiInsight.count({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,status:"ACTIVE"}}),
    tx.aiRecommendation.count({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,approvalStatus:"PENDING"}}),
    tx.aiRecommendation.count({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,approvalStatus:"APPROVED"}}),
    tx.aiActionLedger.count({where:{tenantId:ctx.tenantId,branchId:ctx.branchId}}),
    tx.aiKillSwitch.findMany({where:{OR:[{id:"AI-KILL-GLOBAL",isActive:true},{id:"AI-KILL-TENANT-"+ctx.tenantId,isActive:true}]}}),
  ]);return {tenantId:ctx.tenantId,branchId:ctx.branchId,activeInsightsCount,pendingApprovalsCount,approvedRecommendationsCount,ledgerEntriesCount,killSwitchActive:kills.length>0,dataGrounded:true,aiPlatformOperational:kills.length===0};});}
}
export const globalPrismaAiInsightsRepository=new PrismaAiInsightsRepository();
