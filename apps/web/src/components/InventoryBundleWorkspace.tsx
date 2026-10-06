import React, { useMemo, useState } from "react";
import { Layers, Plus, Save, Trash2 } from "lucide-react";
import { useBranch, useRbac, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { useToast } from "../context/ToastContext.js";
import { commitLocalOutbox } from "../persistence/commitLocalMutation.js";
import { getOrCreatePersistentDeviceId } from "../services/deviceIdentity.js";

type ComponentLine = { variantId: string; quantity: number };

export const InventoryBundleWorkspace: React.FC = () => {
  const { currentTenantId } = useTenant();
  const { currentBranchId } = useBranch();
  const { db, syncOutbox } = useSync();
  const { hasPermission } = useRbac();
  const toast = useToast();
  const [bundleId, setBundleId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [componentQty, setComponentQty] = useState(1);
  const [lines, setLines] = useState<ComponentLine[]>([]);
  const variants = useMemo(() => Array.from(db.productVariants.values()).filter((v:any)=>v.tenantId===currentTenantId&&v.branchId===currentBranchId&&v.isActive!==false) as any[], [db,currentTenantId,currentBranchId]);

  const selected = variants.find((v:any)=>v.id===bundleId);
  const addLine = () => {
    if (!componentId || componentId===bundleId || componentQty<=0) return;
    setLines(prev => {
      const existing = prev.find(x=>x.variantId===componentId);
      return existing ? prev.map(x=>x.variantId===componentId?{...x,quantity:x.quantity+componentQty}:x) : [...prev,{variantId:componentId,quantity:componentQty}];
    });
  };
  const save = async () => {
    if (!currentTenantId || !currentBranchId || !selected || !hasPermission("inventory.adjust")) {
      toast.error("Bundle Save Rejected","Inventory permission and a valid bundle variant are required."); return;
    }
    if (!lines.length) { toast.error("Bundle Save Rejected","Add at least one component."); return; }
    const now = new Date().toISOString();
    const attributes = { ...(selected.attributes || {}), __bundle: true, bundleComponents: lines };
    const updated = { ...selected, attributes, updatedAt: now };
    const operationId = `bundle-update-${selected.id}-${Date.now()}`;
    const idempotencyKey = `BUNDLE-${selected.id}-${Date.now()}`;
    await db.executeAtomicMutation({
      writes: [{ store: "productVariants", key: selected.id, value: updated }],
      outboxItem: {
        id: operationId, entityType: "ProductVariant", entityId: selected.id, operationType: "UPDATE",
        payload: { attributes, _baseUpdatedAt: selected.updatedAt }, clientCreatedAt: now, idempotencyKey, status: "PENDING",
        tenantId: currentTenantId, branchId: currentBranchId
      },
      tenantContext: { tenantId: currentTenantId, branchId: currentBranchId }
    });
    await syncOutbox?.({quiet:true}).catch(()=>{});
    toast.success("Bundle Saved","Bundle definition is now part of the authoritative ProductVariant and syncs through the normal ProductVariant path.");
  };
  const clear = async () => {
    if (!selected || !currentTenantId || !currentBranchId || !hasPermission("inventory.adjust")) return;
    const now = new Date().toISOString();
    const attributes = { ...(selected.attributes || {}) };
    delete attributes.__bundle; delete attributes.bundleComponents;
    const operationId = `bundle-clear-${selected.id}-${Date.now()}`;
    const idempotencyKey = `BUNDLE-CLEAR-${selected.id}-${Date.now()}`;
    await db.executeAtomicMutation({ writes:[{store:"productVariants",key:selected.id,value:{...selected,attributes,updatedAt:now}}], outboxItem:{id:operationId,entityType:"ProductVariant",entityId:selected.id,operationType:"UPDATE",payload:{attributes,_baseUpdatedAt:selected.updatedAt},clientCreatedAt:now,idempotencyKey,status:"PENDING",tenantId:currentTenantId,branchId:currentBranchId},tenantContext:{tenantId:currentTenantId,branchId:currentBranchId}});
    setLines([]); toast.success("Bundle Cleared","Bundle definition removed from the variant.");
  };

  return <div className="v2-space-y-4">
    <div className="v2-card v2-p-4">
      <div className="v2-flex v2-items-center v2-justify-between"><div><div className="v2-card-title"><Layers size={16}/> Product Bundles & Kits</div><div className="v2-text-xs v2-text-muted">Bundle definitions live on ProductVariant attributes and bundle sales expand into component StockLedger deductions.</div></div></div>
      <div className="v2-grid v2-grid-2 v2-gap-3 v2-mt-3">
        <select className="v2-input" value={bundleId} onChange={e=>{setBundleId(e.target.value); const v=variants.find((x:any)=>x.id===e.target.value); setLines(Array.isArray(v?.attributes?.bundleComponents)?v.attributes.bundleComponents:[]);}}>
          <option value="">Select bundle / kit variant</option>{variants.map((v:any)=><option key={v.id} value={v.id}>{v.sku} — {v.name}</option>)}
        </select>
        <select className="v2-input" value={componentId} onChange={e=>setComponentId(e.target.value)}>
          <option value="">Select component</option>{variants.filter((v:any)=>v.id!==bundleId).map((v:any)=><option key={v.id} value={v.id}>{v.sku} — {v.name}</option>)}
        </select>
        <input className="v2-input" type="number" min="0.0001" value={componentQty} onChange={e=>setComponentQty(Number(e.target.value))}/>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={addLine}><Plus size={13}/> Add Component</button>
      </div>
    </div>
    <div className="v2-card"><table className="v2-table"><thead><tr><th>Component SKU</th><th>Component</th><th>Qty per Bundle</th><th>Action</th></tr></thead><tbody>{lines.length===0?<tr><td colSpan={4} className="v2-text-center v2-p-6 v2-text-muted">No components defined.</td></tr>:lines.map((line)=><tr key={line.variantId}><td>{variants.find((v:any)=>v.id===line.variantId)?.sku||line.variantId}</td><td>{variants.find((v:any)=>v.id===line.variantId)?.name||"Unknown"}</td><td>{line.quantity}</td><td><button className="v2-btn v2-btn-ghost v2-btn-xs" onClick={()=>setLines(x=>x.filter(y=>y.variantId!==line.variantId))}><Trash2 size={13}/></button></td></tr>)}</tbody></table><div className="v2-flex v2-justify-end v2-gap-2 v2-p-3"><button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={()=>void clear()}><Trash2 size={13}/> Clear Bundle</button><button className="v2-btn v2-btn-primary v2-btn-sm" onClick={()=>void save()}><Save size={13}/> Save Bundle</button></div></div>
  </div>;
};
