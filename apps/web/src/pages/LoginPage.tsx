import React, { useState } from "react";
import {
  Shield,
  Lock,
  Mail,
  Store,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle,
  Building2,
  AlertCircle,
  PlusCircle,
} from "lucide-react";
import "../auth.css";
import { login } from "../services/apiClient.js";

interface LoginPageProps {
  onAuthenticated: () => void;
  provisioningRequested?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated, provisioningRequested = false }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const openTenantOnboarding = () => {
    window.history.pushState({}, "", "/tenant-onboarding");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <main className="v2-auth-page">
      <section className="v2-auth-hero v2-card" aria-labelledby="auth-title">
        <div>
          <div className="v2-flex v2-items-center v2-gap-3 v2-mb-4">
            <div className="v2-auth-logo" aria-hidden="true">K</div>
            <div>
              <span className="v2-text-xl v2-font-black v2-auth-brand">KwakoPos v2.0</span>
              <span className="badge v2-badge-accent v2-ml-2">ENTERPRISE</span>
            </div>
          </div>
          <h1 id="auth-title" className="v2-text-2xl v2-font-black v2-auth-title">
            Next-Generation Point of Sale &amp; Business Operations
          </h1>
          <p className="v2-text-sm v2-text-muted v2-mb-6 v2-auth-lead">
            Unified multi-tenant architecture for Retail, Pharmacy, Law, Fleet, Agriculture, and Service Enterprise across East Africa.
          </p>
          <div className="v2-space-y-4">
            {[
              { icon: Shield, title: "Offline-First Outbox Sync", desc: "IndexedDB transaction outbox with automatic Cloud Sync" },
              { icon: Store, title: "30+ Native Vertical Modules", desc: "Tailored workflows from FEFO Pharmacy to Legal Retainers" },
              { icon: Building2, title: "Multi-Branch RBAC Control", desc: "Granular tenant and branch authorization chain" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="v2-flex v2-items-start v2-gap-3">
                <div className="v2-auth-feature-icon"><Icon size={18} /></div>
                <div>
                  <div className="v2-text-sm v2-font-bold v2-auth-feature-title">{title}</div>
                  <div className="v2-text-xs v2-text-muted">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="v2-flex v2-items-center v2-justify-between v2-auth-footer">
          <span className="v2-text-xs v2-text-muted">© 2026 KwakoPos Platform Systems · Build 2.0.0</span>
          <span className="v2-text-xs v2-flex v2-items-center v2-gap-1 v2-auth-system-status">
            <CheckCircle size={12} /> System Operational
          </span>
        </div>
      </section>

      <section className="v2-auth-panel" aria-label="Sign in">
        <div className="v2-mb-6">
          <h2 className="v2-text-xl v2-font-black v2-mb-2">{provisioningRequested ? "Authorized Tenant Provisioning" : "Sign in to Workspace"}</h2>
          <p className="v2-text-xs v2-text-muted">
            {provisioningRequested
              ? "Sign in with an authorized platform provisioning account to continue."
              : "Enter your account credentials to access your business workspace."}
          </p>
        </div>

        {provisioningRequested && (
          <div className="v2-card v2-mb-4" role="status" style={{ border: "1px solid var(--accent)", padding: "0.8rem" }}>
            <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold">
              <Shield size={14} /> Authentication is required before tenant provisioning can begin.
            </div>
          </div>
        )}

        {error && (
          <div className="v2-card v2-auth-error v2-mb-4" role="alert">
            <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold">
              <AlertCircle size={14} /> {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="v2-space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="v2-text-xs v2-font-black v2-text-muted v2-auth-label">EMAIL / USERNAME</label>
            <div className="v2-auth-input-wrap">
              <Mail size={15} className="v2-auth-input-icon" aria-hidden="true" />
              <input id="email" className="v2-input v2-auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@business.co.tz" required autoComplete="username" />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="v2-text-xs v2-font-black v2-text-muted v2-auth-label">PASSWORD</label>
            <div className="v2-auth-input-wrap">
              <Lock size={15} className="v2-auth-input-icon" aria-hidden="true" />
              <input id="password" className="v2-input v2-auth-input v2-auth-password" type={showPass ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
              <button type="button" className="v2-auth-password-toggle" onClick={() => setShowPass((current) => !current)} aria-label={showPass ? "Hide password" : "Show password"}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button className="v2-btn v2-btn-primary v2-auth-submit" type="submit" disabled={busy}>
            <span>{busy ? "Signing in…" : provisioningRequested ? "Sign in to Continue Provisioning" : "Sign in to Workspace"}</span>
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        {!provisioningRequested && <>
          <div className="v2-flex v2-items-center v2-gap-3" style={{ margin: "1.25rem 0", color: "var(--text-muted)" }} aria-hidden="true">
            <div style={{ flex: 1, height: 1, background: "var(--surface-border)" }} />
            <span className="v2-text-xs">AUTHORIZED PROVISIONING</span>
            <div style={{ flex: 1, height: 1, background: "var(--surface-border)" }} />
          </div>
          <button className="v2-btn v2-btn-secondary" type="button" onClick={openTenantOnboarding} style={{ width: "100%" }}>
            <PlusCircle size={15} /> Provision a New Business
          </button>
          <p className="v2-text-xs v2-text-muted" style={{ marginTop: 8, textAlign: "center" }}>
            Requires authorized platform provisioning privileges. This does not create anonymous public accounts.
          </p>
        </>}
      </section>
    </main>
  );
};
