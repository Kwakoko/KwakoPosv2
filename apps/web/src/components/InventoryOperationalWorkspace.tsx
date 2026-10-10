import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ClipboardList, RefreshCw, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useBranch, useRbac, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { useToast } from "../context/ToastContext.js";
import { safeUUID } from "../services/applicationApiService.js";
import { buildStockBalanceProjection, queueStockAdjustment } from "../services/inventoryStockService.js";
import { getOrCreatePersistentDeviceId } from "../services/deviceIdentity.js";
import { commitLocalOutbox, commitLocalOutboxes } from "../persistence/commitLocalMutation.js";

type Props = { mode: "transfers" | "count" | "wastage" | "alerts" | "sync" | "drilldown" };

export const InventoryOperationalWorkspace: React.FC<Props> = ({ mode }) => {
  const { currentTenantId } = useTenant();
  const { currentBranchId, currentBranchName, availableBranches } = useBranch();
  const { db, syncOutbox, syncStatus, pendingOutboxCount } = useSync();
  const { hasPermission } = useRbac();
  const toast = useToast();
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [transferId, setTransferId] = useState("");
  const [countSearch, setCountSearch] = useState("");
  const [countValues, setCountValues] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);

  const variants = useMemo(() => Array.from(db.productVariants.values()).filter((v:any) =>
    v.tenantId === currentTenantId && v.branchId === currentBranchId && v.isActive !== false
  ) as any[], [db, currentTenantId, currentBranchId]);

  const projection = useMemo(() => buildStockBalanceProjection(db, currentTenantId, currentBranchId), [db, currentTenantId, currentBranchId]);
  const rows = useMemo(() => variants.map((v:any) => ({
    ...v,
    ledgerStock: Number(projection.byVariant.get(v.id) || 0),
  })).filter((v:any) => !countSearch || String(v.name).toLowerCase().includes(countSearch.toLowerCase()) || String(v.sku).toLowerCase().includes(countSearch.toLowerCase())), [variants, projection, countSearch]);

  const ensureContext = () => {
    if (!currentTenantId || !currentBranchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
    if (!hasPermission("inventory.adjust") && !hasPermission("inventory.transfer") && !hasPermission("stock.manage")) throw new Error("INVENTORY_PERMISSION_REQUIRED");
  };

  const queueInventoryOperation = async (
    entityType: "StockTransfer" | "StockCount" | "WastageRecord",
    entityId: string,
    operationType: "CREATE" | "UPDATE",
    payload: Record<string, unknown>,
    idempotencyKey: string,
    clientCreatedAt = new Date().toISOString(),
  ) => {
    if (!currentTenantId || !currentBranchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
    await commitLocalOutboxes(db, [{
      id: `inventory-${entityType.toLowerCase()}-${entityId}-${idempotencyKey}`,
      entityType,
      entityId,
      operationType,
      payload,
      clientCreatedAt,
      idempotencyKey,
      status: "PENDING",
      tenantId: currentTenantId,
      branchId: currentBranchId,
    }], { tenantId: currentTenantId, branchId: currentBranchId });
  };

  const doTransferRelease = async () => {
    ensureContext();
    if (!hasPermission("inventory.transfer")) throw new Error("INVENTORY_TRANSFER_PERMISSION_REQUIRED");
    const v = variants.find((x: any) => x.id === variantId);
    if (!v || !destinationBranchId || destinationBranchId === currentBranchId || !Number.isFinite(qty) || qty <= 0) throw new Error("TRANSFER_FIELDS_INVALID");
    const id = transferId.trim() || safeUUID();
    await commitLocalOutbox(db, {
      entityType: "StockTransfer", entityId: id, operationType: "CREATE",
      payload: {
        transferNumber: id.startsWith("TR-") ? id : "TR-" + id.slice(0, 8).toUpperCase(),
        sourceBranchId: currentBranchId, destinationBranchId, status: "SUBMITTED",
        items: [{ id: safeUUID(), productId: v.productId, variantId: v.id, quantity: qty, unitCost: Number(v.costPrice || 0) }],
      },
      idempotencyKey: "TRANSFER-CREATE-" + id, tenantId: currentTenantId!, branchId: currentBranchId!,
    });
    setTransferId(id);
    toast.success("Transfer Queued", "Transfer " + id + " is queued. The authoritative sync transaction will deduct source stock.");
  };

  const doTransferReceive = async () => {
    ensureContext();
    if (!hasPermission("inventory.transfer")) throw new Error("INVENTORY_TRANSFER_PERMISSION_REQUIRED");
    if (!currentTenantId || !currentBranchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
    const id = transferId.trim();
    if (!id) throw new Error("TRANSFER_ID_REQUIRED");
    await commitLocalOutbox(db, {
      entityType: "StockTransfer", entityId: id, operationType: "UPDATE",
      payload: { status: "RECEIVED" }, idempotencyKey: "TRANSFER-RECEIVE-" + id + "-" + currentBranchId,
      tenantId: currentTenantId, branchId: currentBranchId,
    });
    toast.success("Transfer Receipt Queued", "Receipt for " + id + " is queued under the selected destination branch.");
  };

  const postCount = async () => {
    ensureContext();
    if (!hasPermission("inventory.adjust")) throw new Error("INVENTORY_ADJUST_PERMISSION_REQUIRED");
    if (!currentTenantId || !currentBranchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
    const countedRows = rows.filter((v: any) => countValues[v.id] !== undefined && countValues[v.id].trim() !== "");
    if (!countedRows.length) throw new Error("STOCK_COUNT_VALUES_REQUIRED");
    const lines = countedRows.map((v: any) => {
      const counted = Number(countValues[v.id]);
      if (!Number.isFinite(counted) || counted < 0) throw new Error("INVALID_COUNT:" + v.sku);
      const systemQuantity = Number(projection.byVariant.get(v.id) || 0);
      return {
        id: safeUUID(), productId: v.productId, variantId: v.id, sku: v.sku, productName: v.name,
        systemQuantity, countedQuantity: counted, varianceQuantity: counted - systemQuantity,
        varianceValue: (counted - systemQuantity) * Number(v.costPrice || 0), unitCost: Number(v.costPrice || 0),
      };
    });
    const countId = safeUUID();
    const now = new Date().toISOString();
    await commitLocalOutboxes(db, [
      {
        entityType: "StockCount", entityId: countId, operationType: "CREATE",
        payload: { sessionNumber: "COUNT-" + countId.slice(0, 8).toUpperCase(), name: "Physical Stock Count", scope: "FULL_STORE", status: "COUNTING", startedAt: now, lines },
        idempotencyKey: "STOCK-COUNT-CREATE-" + countId, tenantId: currentTenantId, branchId: currentBranchId,
      },
      {
        entityType: "StockCount", entityId: countId, operationType: "UPDATE",
        payload: { status: "POSTED", lines: lines.map((line) => ({ id: line.id, countedQuantity: line.countedQuantity })) },
        idempotencyKey: "STOCK-COUNT-POST-" + countId, tenantId: currentTenantId, branchId: currentBranchId,
      },
    ], { tenantId: currentTenantId, branchId: currentBranchId });
    toast.success("Stock Count Queued", "Physical count " + countId + " is queued; only ledger-backed variances will be posted.");
    setCountValues({});
  };

  const postWastage = async (movement: "DAMAGE" | "EXPIRY") => {
    ensureContext();
    if (!hasPermission("inventory.adjust")) throw new Error("INVENTORY_ADJUST_PERMISSION_REQUIRED");
    if (!currentTenantId || !currentBranchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
    const v = variants.find((x: any) => x.id === variantId);
    if (!v || !Number.isFinite(qty) || qty <= 0) throw new Error("WASTAGE_FIELDS_INVALID");
    const id = safeUUID();
    await commitLocalOutbox(db, {
      entityType: "WastageRecord", entityId: id, operationType: "CREATE",
      payload: { productId: v.productId, variantId: v.id, quantity: qty, reason: reason.trim() || movement, notes: "Inventory Wastage & Spillage", occurredAt: new Date().toISOString() },
      idempotencyKey: "WASTAGE-" + id, tenantId: currentTenantId, branchId: currentBranchId,
    });
    toast.success("Wastage Queued", "Wastage " + id + " will be recorded with stock and audit changes in one server transaction.");
  };

  const action = async (fn:()=>Promise<void>) => { setBusy(true); try { await fn(); await syncOutbox?.({quiet:true}).catch(()=>{}); } catch(e:any) { toast.error("Inventory Operation Rejected", String(e?.message || e)); } finally { setBusy(false); } };

  if (mode === "alerts") {
    const alerts = rows.filter((v:any) => Number(v.ledgerStock) <= Number(v.reorderLevel || 0));
    return <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Stock Alerts</div></div>{alerts.length === 0 ? <div className="v2-p-6 v2-text-muted">No low/out-of-stock variants for this branch.</div> : alerts.map((v:any)=><div key={v.id} className="v2-flex v2-items-center v2-justify-between v2-p-3" style={{borderBottom:"1px solid var(--surface-border)"}}><div><strong>{v.name}</strong><div className="v2-text-xs v2-text-muted">{v.sku} · Reorder {v.reorderLevel}</div></div><span className="badge v2-badge-warning">{v.ledgerStock} on hand</span></div>)}</div>;
  }

  if (mode === "sync") {
    return <div className="v2-space-y-4"><div className="v2-card v2-p-4"><div className="v2-flex v2-items-center v2-justify-between"><div><div className="v2-card-title">Inventory Sync Engine</div><div className="v2-text-xs v2-text-muted">Authoritative tenant/branch sync status; no memory-only fallback.</div></div><button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy} onClick={()=>action(async()=>{await syncOutbox?.({force:true}); toast.success("Sync Requested","Inventory outbox dispatch completed or is retrying.");})}><RefreshCw size={13}/> Sync Now</button></div></div><div className="v2-grid v2-grid-4 v2-gap-3"><div className="v2-card v2-p-3"><div className="v2-text-xs v2-text-muted">State</div><strong>{syncStatus.state}</strong></div><div className="v2-card v2-p-3"><div className="v2-text-xs v2-text-muted">Pending</div><strong>{pendingOutboxCount}</strong></div><div className="v2-card v2-p-3"><div className="v2-text-xs v2-text-muted">Failed</div><strong>{syncStatus.failedOutboxCount}</strong></div><div className="v2-card v2-p-3"><div className="v2-text-xs v2-text-muted">Conflicts</div><strong>{syncStatus.openConflictCount}</strong></div></div></div>;
  }

  if (mode === "drilldown") {
    const entries = [...db.stockLedger.values()].filter((l:any)=>l.tenantId===currentTenantId&&l.branchId===currentBranchId).sort((a:any,b:any)=>String(b.occurredAt).localeCompare(String(a.occurredAt))).slice(0,200) as any[];
    return <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Ledger Drilldown</div></div><div style={{overflowX:"auto"}}><table className="v2-table"><thead><tr><th>Time</th><th>SKU</th><th>Movement</th><th>Qty</th><th>Before → After</th><th>Reference</th><th>Operation</th><th>Device</th></tr></thead><tbody>{entries.map((l:any)=><tr key={l.id}><td>{new Date(l.occurredAt).toLocaleString()}</td><td>{l.sku || l.variantId}</td><td>{l.movementType}</td><td>{l.quantityChange}</td><td>{l.quantityBefore} → {l.quantityAfter}</td><td>{l.referenceType}:{l.referenceId}</td><td>{l.operationId}</td><td>{l.deviceId}</td></tr>)}</tbody></table></div></div>;
  }

  if (mode === "count") return <div className="v2-space-y-4"><div className="v2-card v2-p-4"><div className="v2-flex v2-items-center v2-justify-between"><div><div className="v2-card-title">Physical Stock Count</div><div className="v2-text-xs v2-text-muted">Count variance posts as immutable StockLedger adjustments; stock is never overwritten.</div></div><button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy} onClick={()=>action(postCount)}><CheckCircle2 size={13}/> Post Count</button></div><div className="v2-flex v2-items-center v2-gap-2 v2-mt-3"><Search size={13}/><input className="v2-input v2-input-sm" placeholder="Search SKU..." value={countSearch} onChange={e=>setCountSearch(e.target.value)}/></div></div><div className="v2-card"><table className="v2-table"><thead><tr><th>SKU</th><th>Product</th><th>Ledger Qty</th><th>Physical Qty</th><th>Variance</th></tr></thead><tbody>{rows.map((v:any)=>{const raw=countValues[v.id]; const val=raw==null?null:Number(raw); const variance=val==null?null:val-v.ledgerStock; return <tr key={v.id}><td>{v.sku}</td><td>{v.name}</td><td>{v.ledgerStock}</td><td><input className="v2-input v2-input-sm" type="number" min="0" value={raw??""} onChange={e=>setCountValues(x=>({...x,[v.id]:e.target.value}))}/></td><td>{variance==null?"—":variance>0?`+${variance}`:variance}</td></tr>})}</tbody></table></div></div>;

  if (mode === "wastage") return <div className="v2-card v2-p-4"><div className="v2-card-title">Wastage & Spillage</div><div className="v2-grid v2-grid-2 v2-gap-3 v2-mt-3"><select className="v2-input" value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">Select variant</option>{variants.map((v:any)=><option key={v.id} value={v.id}>{v.sku} — {v.name}</option>)}</select><input className="v2-input" type="number" min="0.0001" value={qty} onChange={e=>setQty(Number(e.target.value))}/><input className="v2-input" placeholder="Reason / evidence" value={reason} onChange={e=>setReason(e.target.value)}/></div><div className="v2-flex v2-gap-2 v2-mt-3"><button className="v2-btn v2-btn-danger v2-btn-sm" disabled={busy} onClick={()=>action(()=>postWastage("DAMAGE"))}><Trash2 size={13}/> Damage / Spill</button><button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={()=>action(()=>postWastage("EXPIRY"))}><AlertTriangle size={13}/> Expiry</button></div></div>;

  return <div className="v2-card v2-p-4"><div className="v2-card-title"><ArrowLeftRight size={16}/> Branch Stock Transfer</div><div className="v2-text-xs v2-text-muted v2-mt-1">A transfer is two immutable StockLedger movements linked by one transfer ID. Release at source, then receive at destination.</div><div className="v2-grid v2-grid-2 v2-gap-3 v2-mt-3"><select className="v2-input" value={variantId} onChange={e=>setVariantId(e.target.value)}><option value="">Select variant</option>{variants.map((v:any)=><option key={v.id} value={v.id}>{v.sku} — {v.name}</option>)}</select><input className="v2-input" type="number" min="0.0001" value={qty} onChange={e=>setQty(Number(e.target.value))}/><select className="v2-input" value={destinationBranchId} onChange={e=>setDestinationBranchId(e.target.value)}><option value="">Destination branch</option>{availableBranches.filter(b=>b.id!==currentBranchId).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><input className="v2-input" placeholder="Transfer ID (leave blank to generate)" value={transferId} onChange={e=>setTransferId(e.target.value)}/></div><div className="v2-flex v2-gap-2 v2-mt-3"><button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy} onClick={()=>action(doTransferRelease)}>Release Transfer</button><button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={()=>action(doTransferReceive)}>Receive Transfer</button></div><div className="v2-text-xs v2-text-muted v2-mt-2">Current branch: {currentBranchName || "—"}. Receiving requires the destination branch's matching variant and the transfer ID.</div></div>;
};
