import React, { useState } from "react";
import { Tag, Printer, X, Check, Copy } from "lucide-react";

interface BarcodeLabelProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  category?: string;
  barcode?: string;
  variants?: Array<{ id: string; name: string; sku: string; price: number; stock?: number; barcode?: string }>;
}

interface BarcodeLabelGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: BarcodeLabelProduct[];
}

export const BarcodeLabelGeneratorModal: React.FC<BarcodeLabelGeneratorModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || "");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [copies, setCopies] = useState<number>(12);
  const [format, setFormat] = useState<"thermal_40x30" | "a4_sheet">("thermal_40x30");
  const [includePrice, setIncludePrice] = useState(true);
  const [includeDate, setIncludeDate] = useState(true);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];
  const activeVariant = selectedProduct?.variants?.find((v) => v.id === selectedVariantId);
  const activeItem = activeVariant
    ? {
        name: activeVariant.name.includes("(") ? activeVariant.name : `${selectedProduct?.name} (${activeVariant.name})`,
        sku: activeVariant.sku,
        barcode: activeVariant.barcode || activeVariant.sku,
        price: activeVariant.price,
      }
    : {
        name: selectedProduct?.name || "Product Name",
        sku: selectedProduct?.sku || "SKU-1000",
        barcode: selectedProduct?.barcode || selectedProduct?.sku || "SKU-1000",
        price: selectedProduct?.price || 0,
      };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="v2-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="v2-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="v2-modal-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--surface-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                background: "rgba(56, 189, 248, 0.12)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Tag size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                Barcode & Price Label Generator
              </h2>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                Printable retail shelf stickers and thermal barcodes (Parent & Variant SKUs)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="v2-btn-icon"
            onClick={onClose}
            aria-label="Close barcode generator"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Controls Bar */}
          <div style={{ display: "grid", gridTemplateColumns: selectedProduct?.variants && selectedProduct.variants.length > 0 ? "1fr 1fr 1fr" : "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                Select Product:
              </label>
              <select
                className="v2-select"
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setSelectedVariantId("");
                }}
                style={{ width: "100%" }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) {p.variants && p.variants.length > 0 ? `[${p.variants.length} vars]` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedProduct?.variants && selectedProduct.variants.length > 0 && (
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Select Variation:
                </label>
                <select
                  className="v2-select"
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">Parent Product ({selectedProduct.sku})</option>
                  {selectedProduct.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.sku}) — Tsh {v.price.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                Label Layout:
              </label>
              <select
                className="v2-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                style={{ width: "100%" }}
              >
                <option value="thermal_40x30">40mm x 30mm Thermal Roll (Single Label)</option>
                <option value="a4_sheet">A4 Sticker Sheet (24 Labels per Sheet)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700 }}>Label Copies:</label>
              <input
                type="number"
                min={1}
                max={96}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 70,
                  padding: "0.3rem 0.5rem",
                  borderRadius: "6px",
                  border: "1px solid var(--surface-border)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                }}
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includePrice}
                onChange={(e) => setIncludePrice(e.target.checked)}
              />
              <span>Include Selling Price</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeDate}
                onChange={(e) => setIncludeDate(e.target.checked)}
              />
              <span>Include Date Stamp</span>
            </label>
          </div>

          {/* Label Preview Sheet */}
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Live Print Preview ({copies} label{copies > 1 ? "s" : ""})
            </div>

            <div
              className="printable-barcode-sheet"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "0.75rem",
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                maxHeight: "360px",
                overflowY: "auto",
              }}
            >
              {Array.from({ length: copies }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #94a3b8",
                    borderRadius: "4px",
                    padding: "0.6rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    color: "#0f172a",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: "0.15rem", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeItem.name}
                  </div>

                  {/* Visual Barcode Bars Representation */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "2px",
                      height: "32px",
                      width: "85%",
                      margin: "0.3rem 0",
                    }}
                  >
                    {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 4, 2, 1, 3].map((w, i) => (
                      <div
                        key={i}
                        style={{
                          width: `${w}px`,
                          height: "100%",
                          background: "#000000",
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ fontFamily: "monospace", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", color: "#334155" }}>
                    *{activeItem.barcode || activeItem.sku}*
                  </div>

                  {includePrice && (
                    <div style={{ fontSize: "0.85rem", fontWeight: 900, marginTop: "0.2rem", color: "#0f172a" }}>
                      Tsh {activeItem.price.toLocaleString()}
                    </div>
                  )}

                  {includeDate && (
                    <div style={{ fontSize: "0.55rem", color: "#64748b", marginTop: "0.15rem" }}>
                      LABEL • {new Date().toISOString().slice(0, 10)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--surface-border)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
            Standard 203 DPI Thermal & Laser printer optimized
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={handlePrint}
            >
              <Printer size={15} /> Print Labels
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
