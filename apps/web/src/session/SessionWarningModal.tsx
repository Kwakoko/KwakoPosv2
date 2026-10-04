import React from "react";
import { Clock3, LogOut, ShieldCheck } from "lucide-react";
import { formatSessionCountdown } from "./SessionTimer.js";

interface SessionWarningModalProps {
  open: boolean;
  remainingMs: number;
  onStaySignedIn: () => void;
  onLogout: () => void;
}

export const SessionWarningModal: React.FC<SessionWarningModalProps> = ({ open, remainingMs, onStaySignedIn, onLogout }) => {
  if (!open) return null;
  return (
    <div
      role="presentation"
      style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", background: "rgba(15,23,42,.66)", padding: "1rem" }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expiring-title"
        aria-describedby="session-expiring-message"
        style={{ width: "min(460px, 100%)", background: "var(--surface-1, #fff)", color: "var(--text, #0f172a)", borderRadius: "16px", padding: "1.5rem", boxShadow: "0 25px 60px rgba(0,0,0,.35)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: ".65rem", marginBottom: ".75rem" }}>
          <ShieldCheck size={20} aria-hidden="true" />
          <h2 id="session-expiring-title" style={{ margin: 0, fontSize: "1.1rem" }}>Session Expiring Soon</h2>
        </div>
        <p id="session-expiring-message" style={{ marginTop: 0, color: "var(--text-muted, #64748b)" }}>
          Your session will expire due to inactivity.
        </p>
        <div aria-live="assertive" aria-atomic="true" style={{ display: "flex", alignItems: "center", gap: ".6rem", justifyContent: "center", margin: "1.25rem 0", fontSize: "2rem", fontVariantNumeric: "tabular-nums", fontWeight: 900 }}>
          <Clock3 size={26} aria-hidden="true" />
          {formatSessionCountdown(remainingMs)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
          <button className="v2-btn v2-btn-primary" type="button" onClick={onStaySignedIn}>Stay Signed In</button>
          <button className="v2-btn v2-btn-secondary" type="button" onClick={onLogout}><LogOut size={15} /> Logout Now</button>
        </div>
      </section>
    </div>
  );
};
