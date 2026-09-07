import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { apiFetch } from "../services/apiClient.js";
import { useAuth, useTranslation } from "../context/KwakoPosContexts.js";
import { ALL_MODULE_KEYS } from "../modules/moduleRegistry.js";
import { LanguageSelector } from "../components/LanguageSelector.js";

const STEPS = ["Business Profile", "Localization", "Industry / Modules", "Main Branch", "Owner Account", "Review & Confirm", "Provisioning / Completion"] as const;
type FormState = { businessName: string; slug: string; country: string; currency: string; timezone: string; locale: string; industry: string; modules: string[]; branchName: string; branchCode: string; ownerName: string; ownerEmail: string; ownerPassword: string };
const initialForm: FormState = { businessName: "", slug: "", country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", industry: "Retail", modules: ["Retail"], branchName: "Main Branch", branchCode: "", ownerName: "", ownerEmail: "", ownerPassword: "" };
function makeIdempotencyKey(): string { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

/** Derive a slug from a business name: lowercase, alphanumeric + hyphens, max 32 chars */
function deriveSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

/**
 * Auto-generate a branch code from businessName + branchName.
 * Format: <BIZ_PREFIX>-<BRANCH_SUFFIX>
 *   BIZ_PREFIX  = up to 2 uppercase initials from business name words
 *   BRANCH_SUFFIX = up to 6 uppercase alphanumeric chars from branch name
 * Examples:
 *   "Kwako Retail" + "Main Branch"   → "KR-MAIN"
 *   "Abc"          + "Downtown"      → "AB-DOWNTO"
 *   "XYZ Ltd"      + "Warehouse 2"   → "XL-WAREHO2"
 */
function generateBranchCode(businessName: string, branchName: string): string {
  const bizWords = businessName.trim().split(/\s+/).filter(Boolean);
  const bizPrefix = bizWords
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "BR";

  const branchSuffix = branchName.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "MAIN";

  return `${bizPrefix}-${branchSuffix}`;
}

type ProvisionResponse = { success: boolean; data: { onboardingId: string; tenantId: string; branchId: string; ownerUserId: string; status: string; nextStep?: string } };
type CompletionResponse = { success: boolean; data: { id: string; tenantId: string | null; status: string; currentStep: string; branchId: string | null; ownerUserId: string | null; modules: string[]; country: string; currency: string; timezone: string; locale: string } };

export const TenantOnboardingPage: React.FC = () => {
  const { login: authenticateOwner } = useAuth();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [idempotencyKey] = useState(makeIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompletionResponse["data"] | null>(null);
  // Track whether the user has manually edited the branch code field
  const branchCodeManuallyEdited = useRef(false);
  const modules = useMemo(() => ALL_MODULE_KEYS.slice().sort((a, b) => a.localeCompare(b)), []);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleModule = (module: string) => update("modules", form.modules.includes(module) ? form.modules.filter((m) => m !== module) : [...form.modules, module]);

  // Auto-derive slug when business name changes (step 0)
  const handleBusinessNameChange = useCallback((value: string) => {
    setForm((current) => ({
      ...current,
      businessName: value,
      slug: current.slug === "" || current.slug === deriveSlug(current.businessName)
        ? deriveSlug(value)
        : current.slug,
    }));
  }, []);

  // Auto-generate branch code whenever businessName or branchName changes,
  // unless the user has manually overridden the field.
  useEffect(() => {
    if (!branchCodeManuallyEdited.current) {
      const generated = generateBranchCode(form.businessName, form.branchName);
      setForm((current) => ({ ...current, branchCode: generated }));
    }
  }, [form.businessName, form.branchName]);

  // Regenerate the branch code and reset the manual-override flag
  const regenerateBranchCode = useCallback(() => {
    branchCodeManuallyEdited.current = false;
    const generated = generateBranchCode(form.businessName, form.branchName);
    setForm((current) => ({ ...current, branchCode: generated }));
  }, [form.businessName, form.branchName]);

  const handleBranchCodeChange = (value: string) => {
    branchCodeManuallyEdited.current = true;
    update("branchCode", value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16));
  };

  const handleBranchNameChange = (value: string) => {
    update("branchName", value);
    // If user edited the code manually, do NOT override it; the useEffect won't fire because
    // branchCodeManuallyEdited.current === true. The flag is respected inside the useEffect.
  };

  const validateStep = () => {
    if (step === 0 && form.businessName.trim().length < 2) return "Enter a valid business name.";
    if (step === 1 && (!form.country.trim() || form.currency.trim().length !== 3 || !form.timezone.trim() || !form.locale.trim())) return "Country, 3-letter currency, timezone, and locale are required.";
    if (step === 2 && (!form.industry.trim() || !form.modules.length)) return "Select an industry and at least one module.";
    if (step === 3 && form.branchName.trim().length < 2) return "Enter the main branch name.";
    if (step === 4 && (!form.ownerName.trim() || !form.ownerEmail.includes("@") || form.ownerPassword.length < 12)) return "Owner name, valid email, and a password of at least 12 characters are required.";
    return null;
  };

  const provision = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setStep(6);
    try {
      // The current authenticated platform operator creates the tenant. The API remains server-authoritative.
      const created = await apiFetch<ProvisionResponse>("/api/v1/onboarding/tenants", {
        method: "POST",
        body: JSON.stringify({ ...form, idempotencyKey }),
      });
      const tenant = created.data;

      // Authentication handoff happens BEFORE onboarding can become COMPLETED.
      // Owner credentials remain in React memory and are consumed by the existing auth flow.
      await authenticateOwner(form.ownerEmail.trim(), form.ownerPassword);

      // The completion request now runs under the newly-authenticated owner's tenant context.
      const completed = await apiFetch<CompletionResponse>(`/api/v1/onboarding/tenants/${encodeURIComponent(tenant.tenantId)}/complete`, { method: "POST" });
      if (!completed.success || completed.data.status !== "COMPLETED") throw new Error("Tenant was provisioned but onboarding completion was not confirmed.");

      setResult(completed.data);
      setForm((current) => ({ ...current, ownerPassword: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tenant provisioning failed");
      setStep(5);
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="v2-animate-page-enter v2-space-y-4" style={{ maxWidth: 980, margin: "0 auto" }}>
    <div className="v2-card" style={{ padding: "1.4rem" }}>
      <div className="v2-flex v2-items-center v2-justify-between">
        <div className="v2-flex v2-items-center v2-gap-3">
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--gradient-accent)", color: "#fff" }}><Building2 size={21} /></div>
          <div><h1 className="v2-text-xl v2-font-black">{t("onboarding.title")}</h1><p className="v2-text-xs v2-text-muted">{t("onboarding.subtitle")}</p></div>
        </div>
        <LanguageSelector variant="full" />
      </div>
      <div aria-label="Tenant onboarding progress" style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, minmax(0,1fr))`, gap: 8, marginTop: 20 }}>
        {[t("onboarding.stepBusinessProfile"), t("settings.tabLocalization"), t("onboarding.stepIndustrySector"), t("onboarding.stepBranchSetup"), t("onboarding.stepAdminAccount"), t("onboarding.stepConfirmLaunch"), t("common.loading")].map((label, index) => <div key={label} aria-current={index === step ? "step" : undefined} style={{ padding: 10, borderRadius: 8, border: `1px solid ${index === step ? "var(--accent)" : "var(--surface-border)"}`, opacity: index <= step ? 1 : .55 }}><div className="v2-text-xs v2-font-bold">{index + 1}</div><div className="v2-text-xs">{label}</div></div>)}
      </div>
    </div>
    {error && <div className="v2-card" style={{ border: "1px solid var(--danger)", color: "var(--danger)", padding: "1rem" }} role="alert">{error}</div>}
    {result && <div className="v2-card" style={{ border: "1px solid var(--success)", padding: "1.2rem" }} role="status">
      <div className="v2-flex v2-items-center v2-gap-2"><CheckCircle2 size={18} /><strong>Tenant provisioned, completed and owner authenticated</strong></div>
      <p className="v2-text-xs v2-text-muted">Tenant: {result.tenantId} · Branch: {result.branchId} · Owner: {result.ownerUserId}</p>
      <button className="v2-btn v2-btn-primary" onClick={() => { window.history.pushState({}, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); }} type="button">Open Workspace</button>
    </div>}
    {!result && <div className="v2-card" style={{ padding: "1.4rem" }}>
      {step === 0 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Business Profile</h2><label className="v2-text-xs v2-font-bold" htmlFor="onboarding-business-name">Business name</label><input id="onboarding-business-name" className="v2-input" placeholder="Business name" value={form.businessName} onChange={(e) => handleBusinessNameChange(e.target.value)} required /><label className="v2-text-xs v2-font-bold" htmlFor="onboarding-slug">Tenant slug (optional)</label><input id="onboarding-slug" className="v2-input" placeholder="Tenant slug (optional)" value={form.slug} onChange={(e) => update("slug", e.target.value)} /><p className="v2-text-xs v2-text-muted">Slug auto-derived from business name. You can customise it.</p></div>}
      {step === 1 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Country / Locale / Currency / Timezone</h2><div className="v2-grid-2"><div><label htmlFor="onboarding-country" className="v2-text-xs v2-font-bold">Country</label><input id="onboarding-country" className="v2-input" value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="Country" required /></div><div><label htmlFor="onboarding-currency" className="v2-text-xs v2-font-bold">Currency</label><input id="onboarding-currency" className="v2-input" value={form.currency} onChange={(e) => update("currency", e.target.value)} placeholder="Currency" required /></div><div><label htmlFor="onboarding-locale" className="v2-text-xs v2-font-bold">Locale</label><input id="onboarding-locale" className="v2-input" value={form.locale} onChange={(e) => update("locale", e.target.value)} placeholder="Locale" required /></div><div><label htmlFor="onboarding-timezone" className="v2-text-xs v2-font-bold">Timezone</label><input id="onboarding-timezone" className="v2-input" value={form.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="Timezone" required /></div></div></div>}
      {step === 2 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Industry / Modules</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>{modules.map((module) => <label key={module} className="v2-card" style={{ padding: 12, cursor: "pointer" }}><input type="checkbox" checked={form.modules.includes(module)} onChange={() => toggleModule(module)} /> <span>{module}</span></label>)}</div><label htmlFor="onboarding-industry" className="v2-text-xs v2-font-bold">Primary industry</label><input id="onboarding-industry" className="v2-input" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Primary industry" required /></div>}
      {step === 3 && <div className="v2-space-y-4">
        <h2 className="v2-font-bold">Main Branch</h2>
        <div>
          <label htmlFor="onboarding-branch-name" className="v2-text-xs v2-font-bold">Main branch name</label>
          <input
            id="onboarding-branch-name"
            className="v2-input"
            value={form.branchName}
            onChange={(e) => handleBranchNameChange(e.target.value)}
            placeholder="Main branch name"
            required
          />
        </div>
        <div>
          <div className="v2-flex v2-items-center v2-justify-between" style={{ marginBottom: 4 }}>
            <label htmlFor="onboarding-branch-code" className="v2-text-xs v2-font-bold">
              Branch code
              {!branchCodeManuallyEdited.current && (
                <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "var(--accent)", color: "#fff", fontWeight: 600, letterSpacing: "0.04em", verticalAlign: "middle" }}>
                  AUTO
                </span>
              )}
            </label>
            <button
              type="button"
              title="Re-generate branch code from business and branch names"
              className="v2-btn v2-btn-ghost"
              style={{ padding: "2px 6px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
              onClick={regenerateBranchCode}
            >
              <RefreshCw size={11} />
              Regenerate
            </button>
          </div>
          <input
            id="onboarding-branch-code"
            className="v2-input"
            value={form.branchCode}
            onChange={(e) => handleBranchCodeChange(e.target.value)}
            placeholder="e.g. KR-MAIN"
            maxLength={16}
            style={{ fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}
          />
          <p className="v2-text-xs v2-text-muted" style={{ marginTop: 4 }}>
            Auto-generated as <strong>{generateBranchCode(form.businessName || "BIZ", form.branchName || "Branch")}</strong> from your business + branch names. You can override it or click ↺ to reset.
          </p>
        </div>
      </div>}
      {step === 4 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Owner Account</h2><label htmlFor="onboarding-owner-name" className="v2-text-xs v2-font-bold">Owner name</label><input id="onboarding-owner-name" className="v2-input" value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} placeholder="Owner name" required /><label htmlFor="onboarding-owner-email" className="v2-text-xs v2-font-bold">Owner email</label><input id="onboarding-owner-email" className="v2-input" type="email" value={form.ownerEmail} onChange={(e) => update("ownerEmail", e.target.value)} placeholder="Owner email" autoComplete="email" required /><label htmlFor="onboarding-owner-password" className="v2-text-xs v2-font-bold">Owner password</label><input id="onboarding-owner-password" className="v2-input" type="password" autoComplete="new-password" value={form.ownerPassword} onChange={(e) => update("ownerPassword", e.target.value)} placeholder="Password (12+ characters)" required minLength={12} /><div className="v2-text-xs v2-text-muted"><ShieldCheck size={13} style={{ verticalAlign: "middle" }} /> Credentials remain in React memory only until normal authentication consumes them.</div></div>}
      {step === 5 && <div className="v2-space-y-3"><h2 className="v2-font-bold">Review &amp; Confirm</h2><pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify({ ...form, ownerPassword: "••••••••", idempotencyKey }, null, 2)}</pre></div>}
      {step === 6 && submitting && <div className="v2-flex v2-items-center v2-gap-3" role="status" aria-live="polite"><Loader2 className="v2-animate-spin" size={18} /><div><strong>Provisioning tenant and activating owner workspace…</strong><div className="v2-text-xs v2-text-muted">Creating the tenant transactionally, authenticating the owner, then completing onboarding.</div></div></div>}
      <div className="v2-flex v2-items-center v2-justify-between" style={{ marginTop: 24 }}><button className="v2-btn v2-btn-secondary" type="button" disabled={step === 0 || submitting || step === 6} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /> Back</button>{step < 5 ? <button className="v2-btn v2-btn-primary" type="button" disabled={submitting} onClick={() => { const message = validateStep(); if (message) return setError(message); setError(null); setStep((value) => value + 1); }}><ChevronRight size={15} /> Continue</button> : <button className="v2-btn v2-btn-primary" type="button" onClick={provision} disabled={submitting}>{submitting ? <Loader2 className="v2-animate-spin" size={15} /> : <CheckCircle2 size={15} />} Provision Tenant</button>}</div>
    </div>}
  </div>;
};
