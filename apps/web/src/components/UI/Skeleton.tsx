/**
 * KwakoPosv2 — System UI Shimmer Skeleton Loaders
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides high-fidelity loading placeholder components: Skeleton, SkeletonKPI,
 * SkeletonTable, SkeletonTableRow, SkeletonCard, and SkeletonDashboard.
 * Uses V2 CSS variables and shimmer gradient animation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from "react";

export interface SkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  rounded = "md",
  width,
  height,
  style,
}) => {
  const radiusMap = {
    sm: "var(--radius-sm, 0.35rem)",
    md: "var(--radius-md, 0.55rem)",
    lg: "var(--radius-lg, 0.85rem)",
    xl: "var(--radius-xl, 1.2rem)",
    full: "var(--radius-full, 9999px)",
  };

  return (
    <div
      className={`v2-shimmer ${className}`}
      aria-hidden="true"
      style={{
        borderRadius: radiusMap[rounded],
        width: width !== undefined ? width : "100%",
        height: height !== undefined ? height : "1rem",
        ...style,
      }}
    />
  );
};

// ─── KPI Card Skeleton ────────────────────────────────────────────────────────

export const SkeletonKPI: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    className="v2-card"
    style={{
      padding: "1.2rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Skeleton width="45%" height="0.8rem" />
      <Skeleton width="32px" height="32px" rounded="lg" />
    </div>
    <Skeleton width="65%" height="1.6rem" rounded="md" />
    <Skeleton width="35%" height="0.7rem" />
  </div>
);

// ─── Table Row Skeleton ───────────────────────────────────────────────────────

export const SkeletonTableRow: React.FC<{ cols?: number }> = ({ cols = 6 }) => (
  <tr style={{ borderBottom: "1px solid var(--surface-border-subtle, #243047)" }}>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} style={{ padding: "0.85rem 1rem" }}>
        <Skeleton height="0.85rem" width={`${55 + (i * 11) % 35}%`} />
      </td>
    ))}
  </tr>
);

// ─── Full Table Skeleton ──────────────────────────────────────────────────────

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => (
  <div
    className="v2-card"
    style={{
      overflow: "hidden",
      border: "1px solid var(--surface-border, #334155)",
    }}
  >
    {/* Table Header */}
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        padding: "0.85rem 1rem",
        background: "var(--surface-2, #243047)",
        borderBottom: "1px solid var(--surface-border, #334155)",
      }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} height="0.75rem" width="100%" />
      ))}
    </div>

    {/* Table Body */}
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Card Skeleton ────────────────────────────────────────────────────────────

export const SkeletonCard: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    className="v2-card"
    style={{
      padding: "1.2rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.9rem",
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Skeleton width="40px" height="40px" rounded="xl" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <Skeleton width="60%" height="0.85rem" />
        <Skeleton width="40%" height="0.7rem" />
      </div>
    </div>
    <Skeleton height="0.75rem" width="100%" />
    <Skeleton height="0.75rem" width="85%" />
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
      <Skeleton width="60px" height="24px" rounded="full" />
      <Skeleton width="45px" height="24px" rounded="full" />
    </div>
  </div>
);

// ─── Dashboard Grid Skeleton ──────────────────────────────────────────────────

export const SkeletonDashboard: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
    {/* KPI Row */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem",
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonKPI key={i} />
      ))}
    </div>

    {/* Big Chart + Sidebar Card */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "1rem",
      }}
    >
      <div className="v2-card" style={{ padding: "1.25rem", minHeight: "260px" }}>
        <Skeleton width="160px" height="1rem" style={{ marginBottom: "1rem" }} />
        <Skeleton width="100%" height="190px" rounded="lg" />
      </div>
      <div className="v2-card" style={{ padding: "1.25rem", minHeight: "260px" }}>
        <Skeleton width="130px" height="1rem" style={{ marginBottom: "1rem" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="32px" rounded="md" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default Skeleton;
