import React, { useMemo, useState } from "react";
import { Coins, DollarSign, X, Check, Calculator, AlertTriangle } from "lucide-react";

interface CashCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  expectedTotal?: number;
  title?: string;
  onApply: (calculatedTotal: number, breakdown: Record<string, number>) => void;
}

const DENOMINATIONS = [
  { label: "Tsh 10,000 Note", value: 10000, type: "note" },
  { label: "Tsh 5,000 Note", value: 5000, type: "note" },
  { label: "Tsh 2,000 Note", value: 2000, type: "note" },
  { label: "Tsh 1,000 Note", value: 1000, type: "note" },
  { label: "Tsh 500 Coin", value: 500, type: "coin" },
  { label: "Tsh 200 Coin", value: 200, type: "coin" },
  { label: "Tsh 100 Coin", value: 100, type: "coin" },
  { label: "Tsh 50 Coin", value: 50, type: "coin" },
];

export const CashCalculatorModal: React.FC<CashCalculatorModalProps> = ({
  isOpen,
  onClose,
  expectedTotal,
  title = "Cash Denomination Counter",
  onApply,
}) => {
  const [counts, setCounts] = useState<Record<number, number>>({
    10000: 0,
    5000: 0,
    2000: 0,
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
  });

  const totalCalculated = useMemo(() => {
    return Object.entries(counts).reduce((sum, [valStr, qty]) => {
      return sum + Number(valStr) * (Number(qty) || 0);
    }, 0);
  }, [counts]);

  const variance = expectedTotal !== undefined ? totalCalculated - expectedTotal : 0;

  const handleCountChange = (val: number, delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [val]: Math.max(0, (prev[val] || 0) + delta),
    }));
  };

  const handleDirectInput = (val: number, raw: string) => {
    const num = Math.max(0, parseInt(raw, 10) || 0);
    setCounts((prev) => ({
      ...prev,
      [val]: num,
    }));
  };

  const handleReset = () => {
    setCounts({ 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0 });
  };

  if (!isOpen) return null;

  return (
    <div className="v2-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="v2-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="v2-modal-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--surface-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                background: "rgba(34, 197, 94, 0.12)",
                color: "#22c55e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Calculator size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                {title}
              </h2>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                Zero-arithmetic physical till counting
              </p>
            </div>
          </div>
          <button
            type="button"
            className="v2-btn-icon"
            onClick={onClose}
            aria-label="Close cash calculator"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Denomination Counter List */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {DENOMINATIONS.map((d) => {
            const count = counts[d.value] || 0;
            const subtotal = count * d.value;
            return (
              <div
                key={d.value}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 140px 1fr",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--surface-border)",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  {d.label}
                </div>

                {/* Counter Stepper */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary"
                    onClick={() => handleCountChange(d.value, -1)}
                    style={{ padding: "0.25rem 0.55rem", minWidth: 30 }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={count === 0 ? "" : count}
                    placeholder="0"
                    onChange={(e) => handleDirectInput(d.value, e.target.value)}
                    style={{
                      width: 55,
                      textAlign: "center",
                      padding: "0.3rem",
                      borderRadius: "6px",
                      border: "1px solid var(--surface-border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                    }}
                  />
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary"
                    onClick={() => handleCountChange(d.value, 1)}
                    style={{ padding: "0.25rem 0.55rem", minWidth: 30 }}
                  >
                    +
                  </button>
                </div>

                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.85rem", color: subtotal > 0 ? "var(--text)" : "var(--muted)" }}>
                  Tsh {subtotal.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Calculation Summary Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--surface-border)",
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)" }}>Total Counted Cash:</span>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              Tsh {totalCalculated.toLocaleString()}
            </span>
          </div>

          {expectedTotal !== undefined && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                background: variance === 0 ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                color: variance === 0 ? "#22c55e" : "#f87171",
                fontSize: "0.82rem",
                fontWeight: 700,
              }}
            >
              <span>Variance vs Expected (Tsh {expectedTotal.toLocaleString()}):</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {variance === 0 ? "Exact Match (Tsh 0)" : `${variance > 0 ? "+ " : "- "}Tsh ${Math.abs(variance).toLocaleString()}`}
              </span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={handleReset}
            >
              Clear All
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="v2-btn v2-btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={() => {
                  const record: Record<string, number> = {};
                  Object.entries(counts).forEach(([k, v]) => { record[k] = v; });
                  onApply(totalCalculated, record);
                  onClose();
                }}
              >
                <Check size={14} /> Apply Amount
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
