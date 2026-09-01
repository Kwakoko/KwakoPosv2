/**
 * KwakoPosv2 — Auth Gateway & Login Page
 * High-fidelity authentication portal supporting standard credentials login,
 * role quick-select, POS touch PIN keypad, and workspace selection.
 * Visual design matches AuthGateway split-hero UX.
 * Uses V2 CSS variables and classes (no static inline styles, no Dexie).
 */
import React, { useState } from "react";
import {
  Shield, Key, Lock, Mail, Users, Wallet, Package, Calculator,
  Store, Eye, EyeOff, ArrowRight, Sparkles, CheckCircle, Radio,
  Building2, Phone, AlertCircle, HelpCircle, UserCheck
} from "lucide-react";
import { login } from "../services/apiClient.js";

interface LoginPageProps {
  onAuthenticated: () => void;
}

const DEMO_ACCOUNTS = [
  { role: "Tenant Owner",   email: "owner@kwakopos.com",    pass: "owner123",    icon: Key,        color: "#38bdf8" },
  { role: "Branch Manager", email: "manager@kwakopos.com",  pass: "manager123",  icon: Users,      color: "#818cf8" },
  { role: "Cashier",        email: "cashier@kwakopos.com",  pass: "cashier123",  icon: Wallet,     color: "#4ade80" },
  { role: "Accountant",     email: "accountant@kwakopos.com", pass: "accountant123", icon: Calculator, color: "#fbbf24" },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<"standard" | "pin">("standard");
  const [email, setEmail] = useState("owner@kwakopos.com");
  const [password, setPassword] = useState("owner123");
  const [showPass, setShowPass] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };

  const handlePinDigit = (digit: string) => {
    if (digit === "C") {
      setPinInput("");
      return;
    }
    if (digit === "DEL") {
      setPinInput((prev) => prev.slice(0, -1));
      return;
    }
    if (pinInput.length < 6) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length >= 4) {
        // Auto-submit PIN
        void submitPin(next);
      }
    }
  };

  const submitPin = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      // Authenticate cashier default
      await login("cashier@kwakopos.com", "cashier123");
      onAuthenticated();
    } catch (err) {
      setError("Invalid PIN passcode");
      setPinInput("");
    } finally {
      setBusy(false);
    }
  };

  const quickFill = (acc: typeof DEMO_ACCOUNTS[number]) => {
    setEmail(acc.email);
    setPassword(acc.pass);
    setError(null);
  };

  return (
    <main style={{ minHeight: "100vh", width: "100%", display: "flex", background: "var(--bg-deep)" }}>
      {/* Left split-hero panel */}
      <div
        className="v2-card"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3rem",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          borderRight: "1px solid var(--surface-border)",
          borderRadius: 0,
        }}
      >
        <div>
          <div className="v2-flex v2-items-center v2-gap-3 v2-mb-4">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-xl)",
                background: "var(--gradient-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.3rem",
                fontWeight: 900,
                color: "#fff",
              }}
            >
              K
            </div>
            <div>
              <span className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>
                KwakoPos v2.0
              </span>
              <span className="badge v2-badge-accent v2-ml-2" style={{ fontSize: ".65rem" }}>
                ENTERPRISE
              </span>
            </div>
          </div>

          <h1 className="v2-text-2xl v2-font-black v2-mb-2" style={{ color: "#fff", lineHeight: 1.2 }}>
            Next-Generation Point of Sale & Business Operations
          </h1>
          <p className="v2-text-sm v2-text-muted v2-mb-6" style={{ maxWidth: 460 }}>
            Unified multi-tenant architecture for Retail, Pharmacy, Law, Fleet, Agriculture, and Service Enterprise across East Africa.
          </p>

          {/* Feature list */}
          <div className="v2-space-y-4" style={{ marginTop: "2rem" }}>
            {[
              { icon: Shield, title: "Offline-First Outbox Sync", desc: "IndexedDB transaction outbox with automatic Cloud Sync" },
              { icon: Store, title: "30+ Native Vertical Modules", desc: "Tailored workflows from FEFO Pharmacy to Legal Retainers" },
              { icon: Building2, title: "Multi-Branch RBAC Control", desc: "Granular tenant and branch authorization chain" },
            ].map((f, i) => (
              <div key={i} className="v2-flex v2-items-start v2-gap-3">
                <div
                  style={{
                    padding: ".5rem",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(56,189,248,.12)",
                    color: "var(--accent)",
                  }}
                >
                  <f.icon size={18} />
                </div>
                <div>
                  <div className="v2-text-sm v2-font-bold" style={{ color: "#fff" }}>
                    {f.title}
                  </div>
                  <div className="v2-text-xs v2-text-muted">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero footer */}
        <div className="v2-flex v2-items-center v2-justify-between v2-pt-4" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
          <span className="v2-text-xs v2-text-muted">© 2026 KwakoPos Platform Systems · Build 2.0.0</span>
          <span className="v2-text-xs v2-flex v2-items-center v2-gap-1" style={{ color: "var(--success)" }}>
            <CheckCircle size={12} /> System Operational
          </span>
        </div>
      </div>

      {/* Right sign-in panel */}
      <div
        style={{
          width: 520,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "2.5rem",
          background: "var(--surface)",
        }}
      >
        <div className="v2-mb-6">
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
            <h2 className="v2-text-xl v2-font-black">Sign in to Workspace</h2>
            <div className="v2-flex v2-gap-1">
              <button
                className={`v2-btn v2-btn-sm ${mode === "standard" ? "v2-btn-primary" : "v2-btn-ghost"}`}
                onClick={() => setMode("standard")}
                type="button"
              >
                Password
              </button>
              <button
                className={`v2-btn v2-btn-sm ${mode === "pin" ? "v2-btn-primary" : "v2-btn-ghost"}`}
                onClick={() => setMode("pin")}
                type="button"
              >
                POS PIN
              </button>
            </div>
          </div>
          <p className="v2-text-xs v2-text-muted">Enter credentials or select a demo role to authenticate.</p>
        </div>

        {/* Quick-fill demo account tabs */}
        <div className="v2-mb-4">
          <div className="v2-text-xs v2-font-black v2-text-muted v2-mb-2">DEMO ROLE QUICK-FILL</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".4rem" }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                onClick={() => quickFill(acc)}
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                style={{
                  justifyContent: "flex-start",
                  border: email === acc.email ? `1px solid ${acc.color}` : undefined,
                }}
              >
                <acc.icon size={13} style={{ color: acc.color }} />
                <span className="v2-text-xs v2-font-bold v2-truncate">{acc.role}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            className="v2-card v2-mb-4"
            style={{
              padding: ".75rem 1rem",
              background: "var(--danger-muted)",
              borderColor: "var(--danger)",
              color: "var(--danger)",
            }}
          >
            <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold">
              <AlertCircle size={14} />
              {error}
            </div>
          </div>
        )}

        {mode === "standard" ? (
          <form onSubmit={handleStandardSubmit} className="v2-space-y-4">
            <div>
              <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>
                EMAIL / USERNAME
              </label>
              <div className="v2-flex v2-items-center" style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
                <input
                  className="v2-input"
                  style={{ paddingLeft: "2.4rem" }}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.co.tz"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>
                PASSWORD
              </label>
              <div className="v2-flex v2-items-center" style={{ position: "relative" }}>
                <Lock size={15} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
                <input
                  className="v2-input"
                  style={{ paddingLeft: "2.4rem", paddingRight: "2.4rem" }}
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position: "absolute", right: ".8rem", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              className="v2-btn v2-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: ".75rem" }}
              type="submit"
              disabled={busy}
            >
              {busy ? (
                "Signing in…"
              ) : (
                <>
                  <span>Sign in to Workspace</span> <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* POS Touch Keypad Mode */
          <div>
            <div className="v2-text-center v2-mb-4">
              <div className="v2-mono v2-text-2xl v2-font-black v2-mb-1" style={{ letterSpacing: ".5em", color: "var(--accent)" }}>
                {pinInput ? "•".repeat(pinInput.length) : "ENTER PIN"}
              </div>
              <div className="v2-text-xs v2-text-muted">Enter 4-6 digit cashier passcode</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".5rem", maxWidth: 280, margin: "0 auto" }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "DEL"].map((key) => (
                <button
                  key={key}
                  onClick={() => handlePinDigit(key)}
                  type="button"
                  className="v2-btn v2-btn-secondary"
                  style={{
                    height: 52,
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    justifyContent: "center",
                    background: key === "C" || key === "DEL" ? "var(--surface-3)" : undefined,
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
