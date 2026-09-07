import React, { useState, useEffect } from "react";
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
  Smartphone,
  KeyRound,
} from "lucide-react";
import "../auth.css";
import { login, SuperAdminSetupRequiredError, MfaRequiredError } from "../services/apiClient.js";
import { SuperAdminSetupModal } from "../components/SuperAdminSetupModal.js";
import { useTranslation, useAuth } from "../context/KwakoPosContexts.js";
import { LanguageSelector } from "../components/LanguageSelector.js";

interface LoginPageProps {
  onAuthenticated: () => void;
  provisioningRequested?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated, provisioningRequested = false }) => {
  const { t } = useTranslation();
  const { login: authLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<{ appVersion?: string; gitSha?: string } | null>(null);

  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [setupSuccessMessage, setSetupSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSetupSuccessMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail && !password) {
      setError(t("auth.emailAndPasswordRequiredError"));
      return;
    }
    if (!trimmedEmail) {
      setError(t("auth.emailRequiredError"));
      return;
    }
    if (!password) {
      setError(t("auth.passwordRequiredError"));
      return;
    }
    setBusy(true);
    try {
      const authUser = await authLogin(trimmedEmail, password, mfaRequired ? mfaCode.trim() : undefined);
      if (authUser.role === "SUPER_ADMIN") {
        window.history.pushState({}, "", "/super-admin");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      onAuthenticated();
    } catch (err) {
      if (err instanceof SuperAdminSetupRequiredError) {
        setSetupToken(err.setupToken);
        setSetupModalOpen(true);
        return;
      }
      if (err instanceof MfaRequiredError) {
        setMfaRequired(true);
        setError("Two-Factor Authentication (TOTP) code required for Super Admin.");
        return;
      }
      setError(err instanceof Error ? err.message : t("auth.unableToSignIn"));
    } finally {
      setBusy(false);
    }
  };

  const openTenantOnboarding = () => {
    window.history.pushState({}, "", "/tenant-onboarding");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/system/version")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch release");
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        const identity = j?.data || j;
        setRelease({
          appVersion: identity?.appVersion || identity?.version,
          gitSha: identity?.gitSha,
        });
      })
      .catch(() => {
        // ignore; fallback will be used
      });
    return () => { alive = false; };
  }, []);

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
            {t("auth.title")}
          </h1>
          <p className="v2-text-sm v2-text-muted v2-mb-6 v2-auth-lead">
            {t("auth.subtitle")}
          </p>
          <div className="v2-space-y-4">
            {[
              { icon: Shield, title: t("auth.featureOfflineSyncTitle"), desc: t("auth.featureOfflineSyncDesc") },
              { icon: Store, title: t("auth.featureModulesTitle"), desc: t("auth.featureModulesDesc") },
              { icon: Building2, title: t("auth.featureRbacTitle"), desc: t("auth.featureRbacDesc") },
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
          <span className="v2-text-xs v2-text-muted">
            {t("auth.copyrightNotice", { year: new Date().getFullYear() })}
            <span className="footer-dot"> · </span>
            {release?.appVersion ? `v${release.appVersion}` : "v2.12.5"}
            {release?.gitSha && (
              <>
                <span className="footer-dot"> · </span>
                <span className="v2-mono">build {release.gitSha.slice(0, 8)}</span>
              </>
            )}
          </span>
          <span className="v2-text-xs v2-flex v2-items-center v2-gap-1 v2-auth-system-status">
            <CheckCircle size={12} /> {t("auth.systemOperational")}
          </span>
        </div>
      </section>

      <section className="v2-auth-panel" aria-label="Sign in">
        <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="v2-text-xl v2-font-black v2-mb-1">{provisioningRequested ? t("auth.authorizedProvisioning") : t("auth.signInToWorkspace")}</h2>
            <p className="v2-text-xs v2-text-muted">
              {provisioningRequested
                ? t("auth.provisioningPrompt")
                : t("auth.leadDescription")}
            </p>
          </div>
          <div style={{ marginLeft: "1rem", flexShrink: 0 }}>
            <LanguageSelector variant="full" />
          </div>
        </div>

        {setupSuccessMessage && (
          <div className="v2-card v2-mb-4" role="status" style={{ border: "1px solid #10b981", background: "rgba(16, 185, 129, 0.1)", padding: "0.8rem" }}>
            <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold" style={{ color: "#10b981" }}>
              <CheckCircle size={14} /> {setupSuccessMessage}
            </div>
          </div>
        )}

        {provisioningRequested && (
          <div className="v2-card v2-mb-4" role="status" style={{ border: "1px solid var(--accent)", padding: "0.8rem" }}>
            <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold">
              <Shield size={14} /> {t("auth.provisioningWarning")}
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
            <label htmlFor="email" className="v2-text-xs v2-font-black v2-text-muted v2-auth-label">{t("auth.emailLabel")}</label>
            <div className="v2-auth-input-wrap">
              <Mail size={15} className="v2-auth-input-icon" aria-hidden="true" />
              <input id="email" className="v2-input v2-auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("auth.emailPlaceholder")} required autoComplete="username" />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="v2-text-xs v2-font-black v2-text-muted v2-auth-label">{t("auth.passwordLabel")}</label>
            <div className="v2-auth-input-wrap">
              <Lock size={15} className="v2-auth-input-icon" aria-hidden="true" />
              <input id="password" className="v2-input v2-auth-input v2-auth-password" type={showPass ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("auth.passwordPlaceholder")} required autoComplete="current-password" />
              <button type="button" className="v2-auth-password-toggle" onClick={() => setShowPass((current) => !current)} aria-label={showPass ? t("auth.hidePassword") : t("auth.showPassword")}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {mfaRequired && (
            <div>
              <label htmlFor="mfaCode" className="v2-text-xs v2-font-black v2-text-muted v2-auth-label">Super Admin MFA Code (TOTP)</label>
              <div className="v2-auth-input-wrap">
                <Smartphone size={15} className="v2-auth-input-icon" aria-hidden="true" />
                <input
                  id="mfaCode"
                  className="v2-input v2-auth-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code"
                  required
                  autoFocus
                />
              </div>
            </div>
          )}

          <button className="v2-btn v2-btn-primary v2-auth-submit" type="submit" disabled={busy}>
            <span>{busy ? t("auth.signingIn") : provisioningRequested ? t("auth.signInToContinueProvisioning") : t("auth.signInButton")}</span>
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        {!provisioningRequested && <>
          <div className="v2-flex v2-items-center v2-gap-3" style={{ margin: "1.25rem 0", color: "var(--text-muted)" }} aria-hidden="true">
            <div style={{ flex: 1, height: 1, background: "var(--surface-border)" }} />
            <span className="v2-text-xs">{t("auth.authorizedProvisioning")}</span>
            <div style={{ flex: 1, height: 1, background: "var(--surface-border)" }} />
          </div>
          <button className="v2-btn v2-btn-secondary" type="button" onClick={openTenantOnboarding} style={{ width: "100%" }}>
            <PlusCircle size={15} /> {t("auth.provisionNewBusiness")}
          </button>
          <p className="v2-text-xs v2-text-muted" style={{ marginTop: 8, textAlign: "center" }}>
            {t("auth.provisionNotice")}
          </p>
        </>}

        {/* Public Legal & Governance Footer */}
        <footer style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--surface-border, #e2e8f0)", textAlign: "center" }}>
          <div className="v2-text-xs v2-text-muted" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { window.history.pushState({}, "", "/privacy"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "0.75rem", textDecoration: "underline" }}>{t("legal.privacyPolicy")}</button>
            <span>•</span>
            <button type="button" onClick={() => { window.history.pushState({}, "", "/legal"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "0.75rem", textDecoration: "underline" }}>{t("legal.dataProtectionPolicy")}</button>
            <span>•</span>
            <button type="button" onClick={() => { window.history.pushState({}, "", "/legal"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "0.75rem", textDecoration: "underline" }}>{t("legal.termsOfService")}</button>
            <span>•</span>
            <button type="button" onClick={() => { window.history.pushState({}, "", "/legal"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "0.75rem", textDecoration: "underline" }}>{t("legal.softwareLicense")}</button>
            <span>•</span>
            <button type="button" onClick={() => { window.history.pushState({}, "", "/legal"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "0.75rem", textDecoration: "underline" }}>{t("legal.cookiePolicy")}</button>
            <span>•</span>
            <button type="button" onClick={() => { window.history.pushState({}, "", "/legal"); window.dispatchEvent(new PopStateEvent("popstate")); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", fontSize: "0.75rem", textDecoration: "underline" }}>{t("legal.securityGovernance")}</button>
          </div>
          <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.4rem", fontSize: "0.7rem" }}>
            {t("auth.complianceNotice")}
          </div>
        </footer>
      </section>

      <SuperAdminSetupModal
        isOpen={setupModalOpen}
        setupToken={setupToken}
        onCancel={() => {
          setSetupModalOpen(false);
          setSetupToken("");
        }}
        onSuccess={async (credentials) => {
          setSetupModalOpen(false);
          setSetupToken("");
          if (credentials) {
            try {
              setBusy(true);
              const authUser = await authLogin(
                credentials.email,
                credentials.newPassword,
                credentials.totpCode
              );
              if (authUser.role === "SUPER_ADMIN") {
                window.history.pushState({}, "", "/super-admin");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }
              onAuthenticated();
              return;
            } catch (err) {
              console.warn("Auto-login post activation fallback:", err);
            } finally {
              setBusy(false);
            }
          }
          setPassword("");
          setMfaRequired(true);
          setSetupSuccessMessage("Super Admin activation complete! Please enter your new password and authenticator code to sign in.");
        }}
      />
    </main>
  );
};
