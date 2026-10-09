import React, { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, Building2, CheckCircle2, CircleDollarSign, Network, Package, RefreshCw, Send, Truck, XCircle } from "lucide-react";
import { useBranch, useTenant } from "../context/KwakoPosContexts.js";
import { apiFetch, safeUUID } from "../services/applicationApiService.js";

type ApiResult<T> = { success: boolean; data: T; error?: { code?: string; message?: string } };
type Connection = {
  id: string; buyerTenantId: string; buyerBranchId: string; sellerTenantId: string; sellerBranchId?: string | null;
  buyerName?: string | null; sellerName?: string | null; status: string; notes?: string;
};
type CatalogItem = { sellerVariantId: string; productId: string; sku: string; name: string; description?: string; proposedUnitPrice: number; available: number };
type OrderItem = {
  lineId: string; sellerVariantId: string; buyerVariantId?: string | null; sku: string; name: string;
  requestedQuantity: number; proposedUnitPrice: number; acceptedQuantity?: number | null; unitPrice?: number | null;
  dispatchedQuantity: number; receivedQuantity: number;
};
type PaymentRequest = { id: string; amount: number; paymentMethod: string; provider?: string; providerReference?: string; notes?: string; status: string; createdAt?: string };
type Order = {
  id: string; orderNumber: string; connectionId: string; buyerTenantId: string; buyerBranchId: string;
  sellerTenantId: string; sellerBranchId: string; status: string; financeStatus: string; currency: string;
  items: OrderItem[]; totalAmount: number; settledAmount: number; notes?: string; logistics?: Record<string, any>;
  payments?: PaymentRequest[]; events?: Array<{action: string; fromStatus?: string; toStatus?: string; createdAt: string}>;
};
const money = (v: number, currency = "TZS") => currency + " " + Number(v || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 });
const endpoint = "/api/v1/inter-vertical";
const get = async <T,>(path: string): Promise<T> => (await apiFetch<ApiResult<T>>(path)).data;
const post = async <T,>(path: string, value: unknown): Promise<T> => (await apiFetch<ApiResult<T>>(path, { method: "POST", body: JSON.stringify(value) })).data;
const key = (prefix: string) => prefix + "-" + safeUUID();

export const InterVerticalCommercePage: React.FC = () => {
  const { currentTenantId } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogConnection, setCatalogConnection] = useState("");
  const [sellerTenantId, setSellerTenantId] = useState("");
  const [connectionNotes, setConnectionNotes] = useState("");
  const [creditLimits, setCreditLimits] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [buyerMappings, setBuyerMappings] = useState<Record<string, string>>({});
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [paymentAmount, setPaymentAmount] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState("BANK");
  const [activeDetails, setActiveDetails] = useState<Order | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [c, o] = await Promise.all([
      get<Connection[]>(endpoint + "/connections"),
      get<Order[]>(endpoint + "/orders?role=all"),
    ]);
    setConnections(c || []);
    setOrders(o || []);
  }, []);

  useEffect(() => { void reload().catch((e) => setErrorMessage(String(e?.message || e))); }, [reload]);

  const perform = useCallback(async (label: string, action: () => Promise<unknown>) => {
    setBusy(true); setErrorMessage(""); setStatusMessage("");
    try {
      await action();
      await reload();
      setStatusMessage(label);
    } catch (e: any) {
      setErrorMessage(String(e?.message || "Gateway request failed"));
    } finally { setBusy(false); }
  }, [reload]);

  const createConnection = () => perform("Connection request submitted", async () => {
    await post(endpoint + "/connections", { sellerTenantId: sellerTenantId.trim(), notes: connectionNotes, idempotencyKey: key("link") });
    setSellerTenantId(""); setConnectionNotes("");
  });

  const respondConnection = (connection: Connection, action: "ACCEPT" | "REJECT") => perform(action === "ACCEPT" ? "Business connection activated" : "Connection request rejected", async () => {
    await post(endpoint + "/connections/" + connection.id + "/respond", {
      action, creditLimit: action === "ACCEPT" ? Number(creditLimits[connection.id] || 0) : undefined,
      reason: action === "REJECT" ? "Not accepting this supply relationship" : undefined,
      idempotencyKey: key("connection-response"),
    });
  });

  const showCatalog = (connectionId: string) => perform("Seller catalog loaded", async () => {
    const items = await get<CatalogItem[]>(endpoint + "/catalog?connectionId=" + encodeURIComponent(connectionId));
    setCatalog(items || []); setCatalogConnection(connectionId);
    setQuantities({}); setBuyerMappings({});
  });

  const submitOrder = () => perform("Purchase order submitted to the wholesaler", async () => {
    const lines = catalog.filter((x) => Number(quantities[x.sellerVariantId] || 0) > 0).map((x) => ({
      sellerVariantId: x.sellerVariantId, quantity: Number(quantities[x.sellerVariantId]),
      buyerVariantId: buyerMappings[x.sellerVariantId]?.trim() || undefined,
    }));
    if (!catalogConnection || !lines.length) throw new Error("Choose at least one product and enter a quantity.");
    await post(endpoint + "/orders", { connectionId: catalogConnection, notes: "Created from Inter-Vertical Commerce", currency: "TZS", idempotencyKey: key("order"), items: lines });
    setCatalog([]); setCatalogConnection("");
  });

  const openDetails = (order: Order) => perform("Order details refreshed", async () => {
    setActiveDetails(await get<Order>(endpoint + "/orders/" + order.id));
  });

  const respondOrder = (order: Order, action: "ACCEPT" | "REJECT") => perform(action === "ACCEPT" ? "Order accepted" : "Order rejected", async () => {
    await post(endpoint + "/orders/" + order.id + "/respond", { action, reason: "Unable to fulfil requested order", idempotencyKey: key("order-response") });
    if (activeDetails?.id === order.id) setActiveDetails(await get<Order>(endpoint + "/orders/" + order.id));
  });

  const dispatchOrder = (order: Order) => perform("Dispatch recorded; seller stock and invoice updated", async () => {
    const lines = order.items.filter((x) => Number(x.acceptedQuantity || 0) > x.dispatchedQuantity).map((x) => ({ lineId: x.lineId, quantity: Number(x.acceptedQuantity || 0) - x.dispatchedQuantity }));
    if (!lines.length) throw new Error("No accepted quantity remains to dispatch.");
    const track = tracking[order.id] || "";
    await post(endpoint + "/orders/" + order.id + "/dispatch", { idempotencyKey: key("dispatch"), carrierName: track, trackingNumber: track, items: lines });
  });

  const markTransit = (order: Order) => perform("Shipment marked in transit", async () => {
    const track = tracking[order.id] || "";
    await post(endpoint + "/orders/" + order.id + "/in-transit", { idempotencyKey: key("transit"), carrierName: track, trackingNumber: track });
  });

  const receiveOrder = (order: Order) => perform("Goods receipt posted to Retail inventory and payables", async () => {
    const lines = order.items.filter((x) => x.dispatchedQuantity > x.receivedQuantity).map((x) => {
      const inputKey = order.id + ":" + x.lineId;
      const quantity = Number(receiveQuantities[inputKey] ?? (x.dispatchedQuantity - x.receivedQuantity));
      return {
        lineId: x.lineId, quantity,
        buyerVariantId: buyerMappings[inputKey]?.trim() || x.buyerVariantId || undefined,
      };
    }).filter((x) => x.quantity > 0);
    if (!lines.length) throw new Error("No dispatched quantity remains to receive.");
    await post(endpoint + "/orders/" + order.id + "/receive", { idempotencyKey: key("receive"), notes: "Retail branch receipt", items: lines });
  });

  const submitPayment = (order: Order) => perform("Payment submitted; waiting for wholesaler confirmation", async () => {
    const amount = Number(paymentAmount[order.id] || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a payment amount greater than zero.");
    await post(endpoint + "/orders/" + order.id + "/payments", { idempotencyKey: key("payment"), amount, paymentMethod, notes: "Payment submitted through KwakoPos gateway" });
  });

  const confirmPayment = (order: Order, payment: PaymentRequest) => perform("Payment confirmed in both businesses' finance ledgers", async () => {
    await post(endpoint + "/orders/" + order.id + "/payments/" + payment.id + "/confirm", { idempotencyKey: key("payment-confirm") });
  });

  const cancelOrder = (order: Order) => perform("Order cancelled", async () => {
    await post(endpoint + "/orders/" + order.id + "/cancel", { idempotencyKey: key("cancel"), reason: "Cancelled by buyer" });
  });

  return (
    <div className="v2-space-y-4">
      <div className="v2-card v2-p-4">
        <div className="v2-flex v2-items-center v2-justify-between v2-gap-3">
          <div>
            <div className="v2-card-title"><Network size={18} style={{ display: "inline", marginRight: 8 }} />Inter-Vertical Commerce Gateway</div>
            <div className="v2-text-xs v2-text-muted v2-mt-1">Secure business-to-business orders across tenants and branches · {currentBranchName || currentBranchId || "Current branch"}</div>
          </div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => void perform("Gateway refreshed", reload)} disabled={busy}><RefreshCw size={14} /> Refresh</button>
        </div>
        {statusMessage && <div className="v2-mt-3 v2-text-sm" role="status">{statusMessage}</div>}
        {errorMessage && <div className="v2-mt-3 v2-text-sm v2-text-danger" role="alert">{errorMessage}</div>}
      </div>

      <div className="v2-grid v2-grid-2 v2-gap-4">
        <section className="v2-card v2-p-4">
          <div className="v2-card-title"><Building2 size={16} style={{ display: "inline", marginRight: 8 }} />Connect to a wholesaler</div>
          <p className="v2-text-xs v2-text-muted v2-mt-1">Enter the registered seller tenant ID. The seller must approve the relationship from its fulfilling branch.</p>
          <label className="v2-block v2-text-sm v2-mt-3">Seller tenant ID</label>
          <input className="v2-input v2-mt-1" value={sellerTenantId} onChange={(e) => setSellerTenantId(e.target.value)} placeholder="Registered Wholesale tenant ID" />
          <label className="v2-block v2-text-sm v2-mt-3">Message (optional)</label>
          <input className="v2-input v2-mt-1" value={connectionNotes} onChange={(e) => setConnectionNotes(e.target.value)} placeholder="Supply relationship notes" />
          <button className="v2-btn v2-btn-primary v2-btn-sm v2-mt-3" disabled={busy || !sellerTenantId.trim()} onClick={() => void createConnection()}><Send size={14} /> Request connection</button>
          <div className="v2-divider v2-my-4" />
          <div className="v2-card-title">Connections</div>
          <div className="v2-space-y-3 v2-mt-2">
            {connections.length === 0 && <div className="v2-text-sm v2-text-muted">No business connections yet.</div>}
            {connections.map((connection) => {
              const buyerSide = connection.buyerTenantId === currentTenantId && connection.buyerBranchId === currentBranchId;
              const sellerSide = connection.sellerTenantId === currentTenantId;
              return <div key={connection.id} className="v2-border v2-rounded-lg v2-p-3">
                <div className="v2-flex v2-items-center v2-justify-between v2-gap-2">
                  <strong>{buyerSide ? (connection.sellerName || connection.sellerTenantId) : (connection.buyerName || connection.buyerTenantId)}</strong>
                  <span className="v2-badge">{connection.status}</span>
                </div>
                <div className="v2-text-xs v2-text-muted v2-mt-1">{buyerSide ? "Buyer branch" : "Seller branch"} · {buyerSide ? connection.buyerBranchId : (connection.sellerBranchId || "Branch not yet selected")}</div>
                {sellerSide && connection.status === "PENDING" && <div className="v2-mt-3">
                  <label className="v2-block v2-text-xs">Credit limit (TZS)</label>
                  <input className="v2-input v2-mt-1" type="number" min="1" value={creditLimits[connection.id] || ""} onChange={(e) => setCreditLimits((prev) => ({ ...prev, [connection.id]: e.target.value }))} placeholder="Maximum B2B credit exposure" />
                  <div className="v2-flex v2-gap-2 v2-mt-2">
                    <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy || Number(creditLimits[connection.id] || 0) <= 0} onClick={() => void perform("Business connection activated", async () => { await post(endpoint + "/connections/" + connection.id + "/respond", { action: "ACCEPT", creditLimit: Number(creditLimits[connection.id]), idempotencyKey: key("connection-accept") }); })}><CheckCircle2 size={13} /> Accept</button>
                    <button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={() => void respondConnection(connection, "REJECT")}><XCircle size={13} /> Reject</button>
                  </div>
                </div>}
                {buyerSide && connection.status === "ACTIVE" && <button className="v2-btn v2-btn-secondary v2-btn-sm v2-mt-3" disabled={busy} onClick={() => void showCatalog(connection.id)}><Package size={13} /> Browse catalog</button>}
              </div>;
            })}
          </div>
        </section>

        <section className="v2-card v2-p-4">
          <div className="v2-card-title"><Package size={16} style={{ display: "inline", marginRight: 8 }} />Seller catalog</div>
          {!catalogConnection && <p className="v2-text-sm v2-text-muted v2-mt-2">Select Browse catalog on an active buyer connection to view products.</p>}
          {catalogConnection && <div className="v2-text-xs v2-text-muted v2-mt-2">Catalog loaded · {catalog.length} products</div>}
          <div className="v2-space-y-2 v2-mt-3">
            {catalog.map((item) => <div key={item.sellerVariantId} className="v2-border v2-rounded-lg v2-p-3">
              <div className="v2-flex v2-items-center v2-justify-between v2-gap-2">
                <div><strong>{item.name}</strong><div className="v2-text-xs v2-text-muted">{item.sku} · {Math.round(item.available)} available</div></div>
                <div className="v2-text-sm">{money(item.proposedUnitPrice)}</div>
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2 v2-mt-2">
                <label className="v2-text-xs">Order quantity<input className="v2-input v2-mt-1" type="number" min="0" step="0.01" value={quantities[item.sellerVariantId] || ""} onChange={(e) => setQuantities((prev) => ({ ...prev, [item.sellerVariantId]: e.target.value }))} /></label>
                <label className="v2-text-xs">Retail variant ID (optional)<input className="v2-input v2-mt-1" value={buyerMappings[item.sellerVariantId] || ""} onChange={(e) => setBuyerMappings((prev) => ({ ...prev, [item.sellerVariantId]: e.target.value }))} placeholder="Auto-match by SKU" /></label>
              </div>
            </div>)}
          </div>
          {catalog.length > 0 && <button className="v2-btn v2-btn-primary v2-mt-3" disabled={busy} onClick={() => void submitOrder()}><Send size={14} /> Submit purchase order</button>}
        </section>
      </div>

      <section className="v2-card v2-p-4">
        <div className="v2-flex v2-items-center v2-justify-between v2-gap-2">
          <div className="v2-card-title"><ArrowLeftRight size={17} style={{ display: "inline", marginRight: 8 }} />Order lifecycle</div>
          <span className="v2-text-xs v2-text-muted">{orders.length} recent orders</span>
        </div>
        <div className="v2-space-y-3 v2-mt-3">
          {orders.length === 0 && <div className="v2-text-sm v2-text-muted">No cross-business orders yet.</div>}
          {orders.map((order) => {
            const buyer = order.buyerTenantId === currentTenantId && order.buyerBranchId === currentBranchId;
            const seller = order.sellerTenantId === currentTenantId && order.sellerBranchId === currentBranchId;
            const detail = activeDetails?.id === order.id ? activeDetails : null;
            return <article key={order.id} className="v2-border v2-rounded-lg v2-p-3">
              <div className="v2-flex v2-items-start v2-justify-between v2-gap-3">
                <div>
                  <strong>{order.orderNumber}</strong>
                  <div className="v2-text-xs v2-text-muted v2-mt-1">{buyer ? "Buying from" : "Selling to"} tenant {buyer ? order.sellerTenantId : order.buyerTenantId}</div>
                  <div className="v2-text-sm v2-mt-1">{order.status} · Finance: {order.financeStatus || "OPEN"} · {money(order.totalAmount, order.currency)}</div>
                  <div className="v2-text-xs v2-text-muted v2-mt-1">{order.items.length} lines · {order.items.reduce((n, x) => n + x.dispatchedQuantity, 0)} dispatched · {order.items.reduce((n, x) => n + x.receivedQuantity, 0)} received</div>
                </div>
                <button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={() => void openDetails(order)}><RefreshCw size={13} /> Details</button>
              </div>
              <div className="v2-flex v2-flex-wrap v2-gap-2 v2-mt-3">
                {seller && order.status === "SUBMITTED" && <><button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy} onClick={() => void respondOrder(order, "ACCEPT")}><CheckCircle2 size={13} /> Accept at listed prices</button><button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={() => void respondOrder(order, "REJECT")}><XCircle size={13} /> Reject</button></>}
                {buyer && ["SUBMITTED", "ACCEPTED"].includes(order.status) && <button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={() => void cancelOrder(order)}><XCircle size={13} /> Cancel</button>}
                {seller && ["ACCEPTED", "PARTIALLY_DISPATCHED", "PARTIALLY_RECEIVED"].includes(order.status) && <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy} onClick={() => void dispatchOrder(order)}><Truck size={13} /> Dispatch remaining</button>}
                {seller && ["DISPATCHED", "PARTIALLY_DISPATCHED"].includes(order.status) && <button className="v2-btn v2-btn-secondary v2-btn-sm" disabled={busy} onClick={() => void markTransit(order)}><Truck size={13} /> Mark in transit</button>}
                {seller && ["ACCEPTED", "PARTIALLY_DISPATCHED", "PARTIALLY_RECEIVED"].includes(order.status) && <input className="v2-input" style={{ maxWidth: 210 }} value={tracking[order.id] || ""} onChange={(e) => setTracking((prev) => ({ ...prev, [order.id]: e.target.value }))} placeholder="Carrier / tracking note" />}
              </div>
              {buyer && ["IN_TRANSIT", "DISPATCHED", "PARTIALLY_DISPATCHED", "PARTIALLY_RECEIVED"].includes(order.status) && <div className="v2-mt-3">
                <div className="v2-text-xs v2-text-muted">Receiving quantities default to the outstanding dispatched amount. Enter a Retail variant ID when a SKU was not auto-matched.</div>
                <div className="v2-space-y-2 v2-mt-2">{order.items.filter((x) => x.dispatchedQuantity > x.receivedQuantity).map((item) => {
                  const ik = order.id + ":" + item.lineId;
                  return <div key={item.lineId} className="v2-grid v2-grid-3 v2-gap-2">
                    <div className="v2-text-xs">{item.name} ({item.sku})<div className="v2-text-muted">{item.dispatchedQuantity - item.receivedQuantity} outstanding</div></div>
                    <input className="v2-input" type="number" min="0" step="0.01" value={receiveQuantities[ik] ?? String(item.dispatchedQuantity - item.receivedQuantity)} onChange={(e) => setReceiveQuantities((prev) => ({ ...prev, [ik]: e.target.value }))} aria-label={"Receive quantity for " + item.sku} />
                    <input className="v2-input" value={buyerMappings[ik] ?? item.buyerVariantId ?? ""} onChange={(e) => setBuyerMappings((prev) => ({ ...prev, [ik]: e.target.value }))} placeholder="Retail variant ID" aria-label={"Retail variant mapping for " + item.sku} />
                  </div>;
                })}</div>
                <button className="v2-btn v2-btn-primary v2-btn-sm v2-mt-2" disabled={busy} onClick={() => void receiveOrder(order)}><ArrowDownToLine size={13} /> Post goods receipt</button>
              </div>}
              {buyer && ["PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status) && <div className="v2-grid v2-grid-2 v2-gap-2 v2-mt-3">
                <label className="v2-text-xs">Payment amount (TZS)<input className="v2-input v2-mt-1" type="number" min="0.01" step="0.01" value={paymentAmount[order.id] || ""} onChange={(e) => setPaymentAmount((prev) => ({ ...prev, [order.id]: e.target.value }))} /></label>
                <div><label className="v2-text-xs">Method</label><select className="v2-input v2-mt-1" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="BANK">Bank</option><option value="MOBILE_MONEY">Mobile money</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select><button className="v2-btn v2-btn-secondary v2-btn-sm v2-mt-2" disabled={busy} onClick={() => void submitPayment(order)}><CircleDollarSign size={13} /> Submit payment</button></div>
              </div>}
              {detail && <div className="v2-bg-subtle v2-rounded-lg v2-p-3 v2-mt-3">
                <strong className="v2-text-sm">Events and payments</strong>
                <div className="v2-text-xs v2-text-muted v2-mt-1">{(detail.events || []).map((e) => e.action + " · " + new Date(e.createdAt).toLocaleString()).join("  |  ") || "No events"}</div>
                {(detail.payments || []).map((p) => <div key={p.id} className="v2-flex v2-items-center v2-justify-between v2-gap-2 v2-mt-2">
                  <div className="v2-text-sm">{money(p.amount, order.currency)} · {p.paymentMethod} · {p.status}</div>
                  {seller && p.status === "PENDING_CONFIRMATION" && <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={busy} onClick={() => void confirmPayment(order, p)}><CheckCircle2 size={13} /> Confirm payment</button>}
                </div>)}
              </div>}
            </article>;
          })}
        </div>
      </section>
    </div>
  );
};
