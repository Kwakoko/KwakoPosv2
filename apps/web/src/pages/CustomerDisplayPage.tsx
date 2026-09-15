import React, { useEffect, useState } from "react";
import {
  ShoppingBag, CheckCircle, Smartphone, CreditCard, Banknote,
  Clock, ShieldCheck, Tag, Sparkles
} from "lucide-react";

export interface CustomerDisplayItem {
  name: string;
  price: number;
  qty: number;
  discountPercent?: number;
  notes?: string;
  variantName?: string;
}

export interface CustomerDisplayPayload {
  storeName: string;
  branchName: string;
  cart: CustomerDisplayItem[];
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  taxAmount: number;
  taxRate: number;
  grandTotal: number;
  customerName: string;
  currency: string;
  status: "IDLE" | "RINGING" | "CHECKOUT" | "COMPLETED";
  paymentMethod?: string;
  cashReceived?: number;
  changeDue?: number;
  rctv?: string;
  receiptNumber?: string;
  timestamp: string;
}

const STORAGE_KEY = "kwakopos_customer_display_state";
const CHANNEL_NAME = "kwakopos_customer_display";

export const CustomerDisplayPage: React.FC = () => {
  const [data, setData] = useState<CustomerDisplayPayload>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
    return {
      storeName: "KwakoPos Store",
      branchName: "Main Branch",
      cart: [],
      subtotal: 0,
      discountAmount: 0,
      discountPercent: 0,
      taxAmount: 0,
      taxRate: 0,
      grandTotal: 0,
      customerName: "Walk-In Customer",
      currency: "Tsh",
      status: "IDLE",
      timestamp: new Date().toISOString(),
    };
  });

  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data && typeof event.data === "object") {
          setData(event.data);
        }
      };
    } catch (e) {
      console.warn("[CustomerDisplay] BroadcastChannel unavailable, relying on localStorage", e);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setData(JSON.parse(e.newValue));
        } catch {}
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const fmtMoney = (amount: number) =>
    `${data.currency || "Tsh"} ${Math.round(amount || 0).toLocaleString()}`;

  const isCartActive = data.cart && data.cart.length > 0 && data.status !== "IDLE";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0b1120",
        color: "#f8fafc",
        fontFamily: "var(--font-sans, 'Inter', sans-serif)",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          padding: "1rem 2rem",
          backgroundColor: "#0f172a",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              backgroundColor: "#0284c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
            }}
          >
            <ShoppingBag size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
              {data.storeName}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>{data.branchName}</span>
              <span>•</span>
              <span style={{ color: "#22c55e", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                Counter Active
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          {data.customerName && data.customerName !== "Walk-In Customer" && (
            <div
              style={{
                backgroundColor: "#1e293b",
                padding: "0.4rem 1rem",
                borderRadius: "9999px",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.2)",
              }}
            >
              Customer: {data.customerName}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#cbd5e1",
              backgroundColor: "#1e293b",
              padding: "0.45rem 1rem",
              borderRadius: "10px",
            }}
          >
            <Clock size={16} style={{ color: "#0284c7" }} />
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, display: "flex", padding: "1.5rem 2rem", gap: "2rem", minHeight: 0 }}>
        {data.status === "COMPLETED" ? (
          /* ── Completed Sale State ── */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              backgroundColor: "#0f172a",
              borderRadius: "24px",
              border: "1px solid #1e293b",
              padding: "3rem",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                backgroundColor: "rgba(34, 197, 94, 0.15)",
                color: "#22c55e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.5rem",
                boxShadow: "0 0 30px rgba(34, 197, 94, 0.2)",
              }}
            >
              <CheckCircle size={56} />
            </div>
            <h1 style={{ fontSize: "2.25rem", fontWeight: 900, margin: "0 0 0.5rem 0", color: "#f8fafc" }}>
              Thank You For Your Purchase!
            </h1>
            <p style={{ fontSize: "1.1rem", color: "#94a3b8", margin: "0 0 2rem 0" }}>
              Your electronic receipt has been issued and fiscalized.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1.5rem",
                width: "100%",
                maxWidth: "750px",
                backgroundColor: "#1e293b",
                borderRadius: "16px",
                padding: "1.5rem",
                marginBottom: "2rem",
                border: "1px solid #334155",
              }}
            >
              <div>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                  Total Paid
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#f8fafc", marginTop: "0.35rem" }}>
                  {fmtMoney(data.grandTotal)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                  Payment Method
                </div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#38bdf8", marginTop: "0.45rem" }}>
                  {data.paymentMethod || "Cash"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                  Change Due
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#22c55e", marginTop: "0.35rem" }}>
                  {fmtMoney(data.changeDue || 0)}
                </div>
              </div>
            </div>

            {data.rctv && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#94a3b8", fontSize: "0.85rem" }}>
                <ShieldCheck size={18} style={{ color: "#22c55e" }} />
                <span>TRA VFD Fiscal Code: <strong style={{ color: "#f8fafc" }}>{data.rctv}</strong></span>
              </div>
            )}
          </div>
        ) : !isCartActive ? (
          /* ── Idle / Welcome State ── */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              backgroundColor: "#0f172a",
              borderRadius: "24px",
              border: "1px solid #1e293b",
              padding: "3rem",
            }}
          >
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "32px",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "2rem",
                boxShadow: "0 12px 32px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Sparkles size={52} />
            </div>

            <h1 style={{ fontSize: "2.75rem", fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 0.75rem 0" }}>
              Welcome to {data.storeName}
            </h1>
            <p style={{ fontSize: "1.25rem", color: "#94a3b8", maxWidth: "550px", lineHeight: 1.5, margin: "0 0 3rem 0" }}>
              Please place your selected items on the counter. Our cashier will ring up your order momentarily.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#94a3b8", fontSize: "0.95rem", fontWeight: 700 }}>
                <Banknote size={20} style={{ color: "#22c55e" }} />
                <span>Cash Accepted</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#94a3b8", fontSize: "0.95rem", fontWeight: 700 }}>
                <Smartphone size={20} style={{ color: "#38bdf8" }} />
                <span>M-Pesa / Mobile Money</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#94a3b8", fontSize: "0.95rem", fontWeight: 700 }}>
                <CreditCard size={20} style={{ color: "#a855f7" }} />
                <span>Cards & Bank Transfer</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Active Ringing & Checkout State ── */
          <>
            {/* Left Column: Live Cart Items List */}
            <div
              style={{
                flex: 1.4,
                backgroundColor: "#0f172a",
                borderRadius: "24px",
                border: "1px solid #1e293b",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: "1rem",
                  borderBottom: "1px solid #1e293b",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                  Current Order ({data.cart.reduce((a, b) => a + (b.qty || 1), 0)} items)
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                  Live Counter Sync
                </div>
              </div>

              {/* Items scroll area */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem", paddingRight: "0.5rem" }}>
                {data.cart.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.9rem 1.15rem",
                      backgroundColor: "#1e293b",
                      borderRadius: "14px",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "8px",
                          backgroundColor: "rgba(2, 132, 199, 0.2)",
                          color: "#38bdf8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                        }}
                      >
                        {item.qty}x
                      </span>
                      <div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc" }}>
                          {item.name}
                          {item.variantName && (
                            <span style={{ color: "#94a3b8", fontWeight: 500, fontSize: "0.85rem", marginLeft: "6px" }}>
                              ({item.variantName})
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <div style={{ fontSize: "0.78rem", color: "#38bdf8", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Tag size={12} />
                            <span>Note: {item.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc" }}>
                        {fmtMoney(item.price * item.qty)}
                      </div>
                      {item.qty > 1 && (
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                          {fmtMoney(item.price)} each
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Order Totals & Payment Status */}
            <div
              style={{
                flex: 1,
                backgroundColor: "#0f172a",
                borderRadius: "24px",
                border: "1px solid #1e293b",
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "1.25rem" }}>
                  Payment Summary
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: "0.95rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8" }}>
                    <span>Subtotal</span>
                    <span style={{ color: "#f8fafc", fontWeight: 700 }}>{fmtMoney(data.subtotal)}</span>
                  </div>

                  {data.discountAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#22c55e" }}>
                      <span>Discount ({data.discountPercent}%)</span>
                      <span style={{ fontWeight: 700 }}>−{fmtMoney(data.discountAmount)}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8" }}>
                    <span>VAT ({data.taxRate || 0}%)</span>
                    <span style={{ color: "#f8fafc", fontWeight: 700 }}>{fmtMoney(data.taxAmount)}</span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1.5rem",
                    paddingTop: "1.25rem",
                    borderTop: "1px dashed #334155",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ fontSize: "1.15rem", fontWeight: 900 }}>Total Due</span>
                  <span style={{ fontSize: "2.4rem", fontWeight: 900, color: "#38bdf8", letterSpacing: "-0.03em" }}>
                    {fmtMoney(data.grandTotal)}
                  </span>
                </div>
              </div>

              {/* Checkout status box */}
              {data.status === "CHECKOUT" ? (
                <div
                  style={{
                    backgroundColor: "rgba(2, 132, 199, 0.12)",
                    border: "1px solid rgba(2, 132, 199, 0.35)",
                    borderRadius: "16px",
                    padding: "1.25rem",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "0.85rem", color: "#38bdf8", fontWeight: 800, textTransform: "uppercase", marginBottom: "0.35rem" }}>
                    Payment In Progress
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#f8fafc", marginBottom: "0.25rem" }}>
                    Method: {data.paymentMethod || "Cash"}
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: 0 }}>
                    Please follow cashier instructions or tender payment.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: "#1e293b",
                    borderRadius: "16px",
                    padding: "1rem",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                  }}
                >
                  Thank you for shopping with us · Receipts electronically verified
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
export default CustomerDisplayPage;