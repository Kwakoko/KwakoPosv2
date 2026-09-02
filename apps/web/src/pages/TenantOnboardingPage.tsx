import React, { useMemo, useState } from "react";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import { getAccessToken, login } from "../services/apiClient.js";
import { ALL_MODULE_KEYS } from "../modules/moduleRegistry.js";

const STEPS = ["Business Profile", "Localization", "Industry / Modules", "Main Branch", "Owner Account", "Review & Confirm", "Provisioning / Completion"] as const;

type FormState = {
  businessName: string; slug: string; country: string; currency: string; timezone: string; locale: string; industry: string; modules: string[];
  branchName: string; branchCode: string; ownerName: string; ownerEmail: string; ownerPassword: string;
};
const initialForm: FormState = { businessName: "", slug: "", country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", industry: "Retail", modules: ["Retail"], branchName: "Main Branch", branchCode: "", ownerName: "", ownerEmail: "", ownerPassword: "" };
function makeIdempotencyKey(): string { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export const TenantOnboardingPage: React.FC = () => {
  const [step, setStep] = useState(0); const [form, setForm] = useState<FormState>(initialForm); const [idempotencyKey] = useState(makeIdempotencyKey);
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null); const [result, setResult] = useState<any>(null);
  const modules = useMemo(() => ALL_MODULE_KEYS.slice().sort((a, b) => a.localeCompare(b)), []);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleModule = (module: string) => update("modules", form.modules.includes(module) ? form.modules.filter((m) => m !== module) : [...form.modules, module]);
  const validateStep = () => {
    if (step === 0 && form.businessName.trim().length < 2) return "Enter a valid business name.";
    if (step === 2 && !form.modules.length) return "Select at least one module.";
    if (step === 3 && form.branchName.trim().length < 2) return "Enter the main branch name.";
    if (step === 4 && (!form.ownerName.trim() || !form.ownerEmail.includes("@") || form.ownerPassword.length < 12)) return "Owner name, valid email, and a password of at least 12 characters are required.";
    return null;
  };

  const provision = async () => {
    setSubmitting(true); setError(null); setStep(6);
    try {
      const response = await fetch("/api/v1/onboarding/tenants", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken() || ""}` }, credentials: "include", body: JSON.stringify({ ...form, idempotencyKey }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Tenant provisioning failed");
      const tenant = body.data;
      const completeResponse = await fetch(`/api/v1/onboarding/tenants/${encodeURIComponent(tenant.tenantId)}/complete`, { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${getAccessToken() || ""}` }, credentials: "include" });
      const completeBody = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) throw new Error(completeBody?.error?.message || "Tenant completion failed");
      setResult({ ...tenant, ...completeBody.data, status: completeBody.data?.status || "COMPLETED" });
      // Credentials remain only in React memory and are immediately consumed by the normal authentication flow.
      await login(form.ownerEmail, form.ownerPassword);
    } catch (e) { setError(e instanceof Error ? e.message : "Tenant provisioning failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4" style={{ maxWidth: 980, margin: "0 auto" }}>
      <div className="v2-card" style={{ padding: "1.4rem" }}>
        <div className="v2-flex v2-items-center v2-gap-3"><div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--gradient-accent)", color: "#fff" }}><Building2 size={21} /></div><div><h1 className="v2-text-xl v2-font-black">Tenant Onboarding & Provisioning</h1><p className="v2-text-xs v2-text-muted">Production tenant, branch, owner, defaults, module entitlements and audit trail.</p></div></div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, minmax(0,1fr))`, gap: 8, marginTop: 20 }}>{STEPS.map((label, index) => <div key={label} style={{ padding: 10, borderRadius: 8, border: `1px solid ${index === step ? "var(--accent)" : "var(--surface-border)"}`, opacity: index <= step ? 1 : .55 }}><div className="v2-text-xs v2-font-bold">{index + 1}</div><div className="v2-text-xs">{label}</div></div>)}</div>
      </div>
      {error && <div className="v2-card" style={{ border: "1px solid var(--danger)", color: "var(--danger)", padding: "1rem" }}>{error}</div>}
      {result && <div className="v2-card" style={{ border: "1px solid var(--success)", padding: "1.2rem" }}><div className="v2-flex v2-items-center v2-gap-2"><CheckCircle2 size={18} /><strong>Tenant provisioned and completed</strong></div><p className="v2-text-xs v2-text-muted">Tenant: {result.tenantId} · Branch: {result.branchId} · Owner: {result.ownerUserId}</p><button className="v2-btn v2-btn-primary" onClick={() => { window.history.pushState({}, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); }} type="button">Open Workspace</button></div>}
      {!result && step < 6 && <div className="v2-card" style={{ padding: "1.4rem" }}>
        {step === 0 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Business Profile</h2><input className="v2-input" placeholder="Business name" value={form.businessName} onChange={(e) => update("businessName", e.target.value)} /><input className="v2-input" placeholder="Tenant slug (optional)" value={form.slug} onChange={(e) => update("slug", e.target.value)} /></div>}
        {step === 1 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Country / Locale / Currency / Timezone</h2><div className="v2-grid-2"><input className="v2-input" value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="Country" /><input className="v2-input" value={form.currency} onChange={(e) => update("currency", e.target.value)} placeholder="Currency" /><input className="v2-input" value={form.locale} onChange={(e) => update("locale", e.target.value)} placeholder="Locale" /><input className="v2-input" value={form.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="Timezone" /></div></div>}
        {step === 2 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Industry / Modules</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>{modules.map((module) => <label key={module} className="v2-card" style={{ padding: 12, cursor: "pointer" }}><input type="checkbox" checked={form.modules.includes(module)} onChange={() => toggleModule(module)} /> <span>{module}</span></label>)}</div><input className="v2-input" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Primary industry" /></div>}
        {step === 3 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Main Branch</h2><input className="v2-input" value={form.branchName} onChange={(e) => update("branchName", e.target.value)} placeholder="Main branch name" /><input className="v2-input" value={form.branchCode} onChange={(e) => update("branchCode", e.target.value)} placeholder="Branch code (optional)" /></div>}
        {step === 4 && <div className="v2-space-y-4"><h2 className="v2-font-bold">Owner Account</h2><input className="v2-input" value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} placeholder="Owner name" /><input className="v2-input" type="email" value={form.ownerEmail} onChange={(e) => update("ownerEmail", e.target.value)} placeholder="Owner email" /><input className="v2-input" type="password" autoComplete="new-password" value={form.ownerPassword} onChange={(e) => update("ownerPassword", e.target.value)} placeholder="Password (12+ characters)" /><div className="v2-text-xs v2-text-muted"><ShieldCheck size={13} style={{ verticalAlign: "middle" }} /> Credentials are never written to localStorage or IndexedDB.</div></div>}
        {step === 5 && <div className="v2-space-y-3"><h2 className="v2-font-bold">Review & Confirm</h2><pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify({ ...form, ownerPassword: "••••••••", idempotencyKey }, null, 2)}</pre></div>}
        <div className="v2-flex v2-items-center v2-justify-between" style={{ marginTop: 24 }}><button className="v2-btn v2-btn-secondary" type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /> Back</button>{step < 5 ? <button className="v2-btn v2-btn-primary" type="button" onClick={() => { const message = validateStep(); if (message) return setError(message); setError(null); setStep((value) => value + 1); }}><ChevronRight size={15} /> Continue</button> : <button className="v2-btn v2-btn-primary" type="button" onClick={provision} disabled={submitting}>{submitting ? <Loader2 className="v2-animate-spin" size={15} /> : <CheckCircle2 size={15} />} Provision Tenant</button>}</div>
      </div>}
    </div>
  );
};
