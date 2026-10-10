import React, { useMemo, useState } from "react";
import { Layers, Plus, Save, Trash2 } from "lucide-react";
import { useBranch, useRbac, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { useToast } from "../context/ToastContext.js";
import { getBundleAvailableQuantity } from "../services/inventoryStockService.js";
import { commitLocalOutbox } from "../persistence/commitLocalMutation.js";

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
      toast.error("Bundle Save Rejected", "Inventory permission and a valid bundle variant are required."); return;
    }
    if (!lines.length) { toast.error("Bundle Save Rejected", "Add at least one component."); return; }
    const normalized = lines.map((line) => ({ componentVariantId: String(line.variantId), quantity: Number(line.quantity) }));
    const seen = new Set<string>();
    for (const line of normalized) {
      const component = variants.find((v: any) => v.id === line.componentVariantId);
      if (!component || component.tenantId !== currentTenantId || component.branchId !== currentBranchId ||
          component.isActive === false || component.id === selected.id || !Number.isFinite(line.quantity) ||
          line.quantity <= 0 || seen.has(component.id)) {
        toast.error("Bundle Save Rejected", "Components must be unique active variants in the current tenant and branch, with positive quantities."); return;
      }
      if (component.attributes?.__bundle === true || Array.isArray(component.attributes?.bundleComponents)) {
        toast.error("Bundle Save Rejected", "Nested bundles and kits are not supported."); return;
      }
      seen.add(component.id);
    }
    const now = new Date().toISOString();
    const currentBundles = db.getConfigurationLocal("inventory:ops:ProductBundle", { tenantId: currentTenantId, branchId: currentBranchId });
    const previous = Array.isArray(currentBundles) ? currentBundles : [];
    const exists = previous.some((bundle: any) => bundle.id === selected.id);
    const idempotencyKey = "BUNDLE-" + selected.id + "-" + Date.now();
    await commitLocalOutbox(db, {
      entityType: "ProductBundle", entityId: selected.id, operationType: exists ? "UPDATE" : "CREATE",
      payload: { productId: selected.productId, name: selected.name, status: "ACTIVE", effectiveFrom: now, notes: "Retail product bundle / kit", items: normalized },
      idempotencyKey, tenantId: currentTenantId, branchId: currentBranchId,
    });
    const next = [...previous.filter((bundle: any) => bundle.id !== selected.id),
      { id: selected.id, productId: selected.productId, name: selected.name, items: normalized, updatedAt: now }];
    db.saveConfigurationLocal("inventory:ops:ProductBundle", next, { tenantId: currentTenantId, branchId: currentBranchId });
    await syncOutbox?.({ quiet: true }).catch(() => undefined);
    toast.success("Bundle Save Queued", "The bundle definition is queued as an authoritative ProductBundle record.");
  };
  const clear = async () => {
    if (!selected || !currentTenantId || !currentBranchId || !hasPermission("inventory.adjust")) return;
    const idempotencyKey = "BUNDLE-CLEAR-" + selected.id + "-" + Date.now();
    await commitLocalOutbox(db, {
      entityType: "ProductBundle", entityId: selected.id, operationType: "DELETE",
      payload: { productId: selected.productId, reason: "Bundle cleared by authorized user" },
      idempotencyKey, tenantId: currentTenantId, branchId: currentBranchId,
    });
    const current = db.getConfigurationLocal("inventory:ops:ProductBundle", { tenantId: currentTenantId, branchId: currentBranchId });
    db.saveConfigurationLocal("inventory:ops:ProductBundle", Array.isArray(current) ? current.filter((bundle: any) => bundle.id !== selected.id) : [],
      { tenantId: currentTenantId, branchId: currentBranchId });
    setLines([]);
    await syncOutbox?.({ quiet: true }).catch(() => undefined);
    toast.success("Bundle Removal Queued", "The bundle will be marked inactive by the authoritative sync transaction.");
  };

  return <div className="v2-space-y-4">
    <div className="v2-card v2-p-4">
      <div className="v2-flex v2-items-center v2-justify-between"><div><div className="v2-card-title"><Layers size={16}/> Product Bundles & Kits</div><div className="v2-text-xs v2-text-muted">Bundle definitions live on ProductVariant attributes and bundle sales expand into component StockLedger deductions.</div></div></div>
      <div className="v2-grid v2-grid-2 v2-gap-3 v2-mt-3">
        <select className="v2-input" value={bundleId} onChange={e=>{setBundleId(e.target.value); const v=variants.find((x:any)=>x.id===e.target.value); setLines(Array.isArray(v?.attributes?.bundleComponents)?v.attributes.bundleComponents:[]);}}>
          <option value="">Select bundle / kit variant</option>{variants.map((v:any)=><option key={v.id} value={v.id}>{v.sku} — {v.name}</option>)}
        </select>
        <div className="v2-card v2-p-2"><div className="v2-text-xs v2-text-muted">Available bundle units</div><div className="v2-text-lg">{selected && currentTenantId && currentBranchId ? (()=>{ try { return getBundleAvailableQuantity(db, selected.id, currentTenantId, currentBranchId); } catch { return 0; } })() : 0}</div></div>
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
