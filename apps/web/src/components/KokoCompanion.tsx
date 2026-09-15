import React from "react";
import { KOKO_PRODUCT_PROFILE } from "@kwakopos2/contracts";

export type KokoProductContext = "sync-status" | "inventory-intelligence" | "business-insights" | "onboarding";

export interface KokoCompanionProps {
  context: KokoProductContext;
  compact?: boolean;
  className?: string;
}

const KOKO = KOKO_PRODUCT_PROFILE;

export const KokoMark: React.FC<{ size?: number }> = ({ size = 42 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" role="img">
    <circle cx="32" cy="32" r="30" fill="var(--kwakoko-deep, #071F1A)" />
    <path d="M16 27c0-7 7-12 16-12s16 5 16 12v9c0 8-7 14-16 14s-16-6-16-14v-9Z" fill="var(--kwakoko-forest, #0B5D4A)" />
    <path d="M19 24c-6-4-8-9-5-12 4-2 9 1 11 7M45 24c6-4 8-9 5-12-4-2-9 1-11 7" fill="none" stroke="var(--koko-gold, #D4A72C)" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M32 27c4 0 7 3 7 7v8c0 5-3 8-7 8s-7-3-7-8v-8c0-4 3-7 7-7Z" fill="var(--koko-sand, #F3EBDD)" opacity="0.95" />
    <circle cx="26" cy="25" r="2.2" fill="var(--koko-sand, #F3EBDD)" />
    <circle cx="38" cy="25" r="2.2" fill="var(--koko-sand, #F3EBDD)" />
  </svg>
);

export const KokoCompanion: React.FC<KokoCompanionProps> = ({ context, compact = false, className = "" }) => {
  const message = KOKO.messages[context];
  return (
    <div className={className} data-koko-context={context} style={{
      display: "flex",
      alignItems: "center",
      gap: compact ? "0.6rem" : "0.8rem",
      padding: compact ? "0.6rem 0.75rem" : "0.85rem 1rem",
      border: "1px solid color-mix(in srgb, var(--kwakoko-forest, #0B5D4A) 45%, transparent)",
      background: "color-mix(in srgb, var(--kwakoko-forest, #0B5D4A) 10%, transparent)",
      borderRadius: "var(--radius-lg, 0.85rem)",
      color: "var(--text, #f8fafc)",
    }}>
      <KokoMark size={compact ? 32 : 40} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: compact ? "0.72rem" : "0.76rem", fontWeight: 800, color: "var(--koko-gold, #D4A72C)", marginBottom: "0.1rem" }}>
          {KOKO.name}
        </div>
        <div style={{ fontSize: compact ? "0.75rem" : "0.8rem", lineHeight: 1.4, color: "var(--text-secondary, #cbd5e1)" }}>
          {message}
        </div>
      </div>
    </div>
  );
};

export default KokoCompanion;
