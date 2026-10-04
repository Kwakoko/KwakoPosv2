/**
 * KwakoPosv2 — System Settings & Enterprise Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete 10-tab enterprise settings command center:
 *   1. Business Profile (TIN, VRN, Legal Name, Address, Fiscal Info)
 *   2. Language & Localization (English, French, Kiswahili live selection & format preview)
 *   3. POS Counter Settings (Printers, barcode scanners, cash drawer kick)
 *   4. Tax & Currency (VAT 18%, TZS currency, TRA VFD endpoint)
 *   5. Inventory Settings (FEFO batching, low stock bounds, negative stock rule)
 *   6. Security & Session (Session timeout, PIN passcode policy, IP whitelist)
 *   7. Notifications & Alerts (SMS gateway, low stock alerts, daily email)
 *   8. Sync & Offline Outbox (IndexedDB queue, sync interval, conflict policy)
 *   9. Integrations (TRA VFD, M-Pesa C2B/B2C, Airtel Money, Banks)
 *  10. Advanced System (Database maintenance, audit logs, backup export)
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Settings, Building, Printer, Scale, Package, Shield, Bell, RefreshCw,
  Zap, Database, Save, CheckCircle, Globe, Check, Sliders, Calendar,
  DollarSign, Hash, LucideIcon, Trash2, AlertTriangle, FileText, Sparkles,
  ShieldCheck, ArrowRight, CreditCard
} from "lucide-react";
import { useTenant, useBranch, useModule, useSync, useTranslation, useLocale, useFormatters, useRbac } from "../context/KwakoPosContexts.js";
import { useToast } from "../components/UI/Toast.js";
import { HoldToConfirmButton } from "../components/UI/HoldToConfirmButton.js";
import { tenantStoreCleanupService } from "../services/tenantStoreCleanupService.js";
import { SUPPORTED_LOCALES, SupportedLocale } from "../i18n/types.js";
import { apiFetch } from "../services/apiClient.js";
import { ToggleSwitch } from "../components/UI/ToggleSwitch.js";
import { TraVfdFiscalizationCard, TraVfdCardConfig } from "../components/TRA/TraVfdFiscalizationCard.js";
import { HumanIdBadge } from "../components/UI/HumanIdBadge.js";

type SettingsTab =
  | "profile" | "localization" | "pos" | "tax" | "fiscal" | "inventory"
  | "security" | "notifications" | "sync" | "integrations" | "developer" | "advanced";

export interface SettingsPageProps {
  activeTab?: string;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ activeTab: propActiveTab }) => {
  const { currentTenantId, currentTenantName, currentTenantSlug } = useTenant();
  const { setActiveTab: setGlobalActiveTab } = useModule();
  const { currentBranchName, currentBranchId } = useBranch();
  const { hasPermission } = useRbac();
  const canManageSettings = hasPermission("settings.manage") || hasPermission("*");
  const { db } = useSync();
  const toast = useToast();
  const { t } = useTranslation();
  const { locale, setLocale, availableLocales } = useLocale();
  const { formatCurrency, formatMoneyCompact, formatDate, formatTime, formatNumber } = useFormatters();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const selectSettingsTab = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    const globalTab: Record<SettingsTab, string> = {
      "profile": "Business Profile & Identity",
      "localization": "Settings",
      "pos": "POS Configurations",
      "tax": "Tax & Billing",
      "fiscal": "Fiscal Device (TRA)",
      "inventory": "Inventory Rules",
      "security": "Security Policies",
      "notifications": "Settings",
      "sync": "Settings",
      "integrations": "Settings",
      "developer": "Developer Options",
      "advanced": "Change Log",
    };
    setGlobalActiveTab(globalTab[tab]);
  }, [setGlobalActiveTab]);

  useEffect(() => {
    if (!propActiveTab) return;
    const map: Record<string, SettingsTab> = {
      // Exact sidebar sub-item strings (moduleRegistry.ts)
      "Business Profile & Identity": "profile",
      "POS Configurations":          "pos",
      "Inventory Rules":             "inventory",
      "Tax & Billing":               "tax",
      "Fiscal Device (TRA)":         "fiscal",
      "Fiscal Device":               "fiscal",
      "fiscal":                      "fiscal",
      "tra":                         "fiscal",
      "tra-vfd":                     "fiscal",
      "vfd":                         "fiscal",
      "Security Policies":           "security",
      "Terminals & Sessions":        "pos",
      "Trash Can & Recovery":        "advanced",
      "Subscriptions & Billing":     "profile",
      "Developer Options":           "developer",
      "Developer":                   "developer",
      "developer":                   "developer",
      "Help & Manuals":              "profile",
      "Change Log":                  "advanced",
      // Legacy / alternative aliases
      "General Settings":            "profile",
      "POS Settings":                "pos",
      "Tax & Currency":              "tax",
      "Printers & Hardware":         "pos",
      "Barcode & Labels":            "inventory",
      "Payment Gateways":            "integrations",
      "Backup & Restore":            "advanced",
      "Audit Trail":                 "advanced",
      "Branch Management":           "profile",
      "Custom Fields":               "advanced",
    };
    if (map[propActiveTab]) {
      setActiveTab(map[propActiveTab]);
    }
  }, [propActiveTab]);


  // Form states across tabs
  const [profile, setProfile] = useState(() => {
    const saved = db.getConfigurationLocal?.("business.profile", { tenantId: currentTenantId || "", branchId: currentBranchId || "" }) as any;
    return {
      businessName: saved?.businessName || currentTenantName || "",
      tradingName: saved?.tradingName || "KwakoPos Central",
      tinNumber: saved?.tinNumber || "",
      vrnNumber: saved?.vrnNumber || "",
      email: saved?.email || "",
      phone: saved?.phone || "",
      address: saved?.address || "",
    };
  });

  useEffect(() => {
    const saved = db.getConfigurationLocal?.("business.profile", { tenantId: currentTenantId || "", branchId: currentBranchId || "" }) as any;
    if (saved) {
      setProfile((prev) => ({
        ...prev,
        businessName: saved.businessName || currentTenantName || prev.businessName,
        tradingName: saved.tradingName || prev.tradingName,
        tinNumber: saved.tinNumber || prev.tinNumber,
        vrnNumber: saved.vrnNumber || prev.vrnNumber,
        email: saved.email || prev.email,
        phone: saved.phone || prev.phone,
        address: saved.address || prev.address,
      }));
    }
  }, [currentTenantName, db]);

  useEffect(() => {
    const saved = db.getConfigurationLocal?.("tax.config", { tenantId: currentTenantId || "", branchId: currentBranchId || "" }) as any;
    const savedVfd = db.getConfigurationLocal?.("tra_vfd_config", { tenantId: currentTenantId || "", branchId: currentBranchId || "" }) as any;
    if (saved || savedVfd) {
      setTaxConfig((prev) => ({
        ...prev,
        vatEnabled: Boolean(saved?.vatEnabled),
        vatRatePercent: Number(saved?.vatRatePercent ?? 0),
        currencySymbol: saved?.currencySymbol || prev.currencySymbol,
        currencyCode: saved?.currencyCode || prev.currencyCode,
        traVfdEnabled: savedVfd?.enabled ?? saved?.traVfdEnabled ?? prev.traVfdEnabled,
        traVfdEndpoint: savedVfd?.endpoint || saved?.traVfdEndpoint || prev.traVfdEndpoint,
        traVfdEnvironment: (savedVfd?.environment || saved?.traVfdEnvironment || prev.traVfdEnvironment || "TEST") as "TEST" | "PRODUCTION",
        traVfdTin: savedVfd?.tin || saved?.traVfdTin || prev.traVfdTin || "",
        traVfdCertSerial: savedVfd?.certSerial || saved?.traVfdCertSerial || prev.traVfdCertSerial || "",
        traVfdRegistrationId: savedVfd?.registrationId || saved?.traVfdRegistrationId || prev.traVfdRegistrationId || "",
        traVfdEfdSerial: savedVfd?.efdSerial || saved?.traVfdEfdSerial || prev.traVfdEfdSerial || "",
        traVfdReceiptCode: savedVfd?.receiptCode || saved?.traVfdReceiptCode || prev.traVfdReceiptCode || "",
        traVfdRoutingKey: savedVfd?.routingKey || saved?.traVfdRoutingKey || prev.traVfdRoutingKey || "vfdrct",
      }));
    }
  }, [db, currentTenantId, currentBranchId]);

  useEffect(() => {
    if (!currentTenantId || !currentBranchId || typeof navigator === "undefined" || !navigator.onLine) return;
    void apiFetch<any>("/api/v1/tra-vfd/config")
      .then((res) => {
        const config = res?.data || res;
        if (!config || typeof config.enabled !== "boolean") return;
        const next = {
          enabled: config.enabled,
          endpoint: String(config.endpoint || ""),
          environment: (config.environment || "TEST") as "TEST" | "PRODUCTION",
          tin: config.tin || "",
          certSerial: config.certSerial || "",
          registrationId: config.registrationId || "",
          efdSerial: config.efdSerial || "",
          receiptCode: config.receiptCode || "",
          routingKey: config.routingKey || "vfdrct",
        };
        setTaxConfig((prev) => ({
          ...prev,
          traVfdEnabled: next.enabled,
          traVfdEndpoint: next.endpoint,
          traVfdEnvironment: next.environment,
          traVfdTin: next.tin,
          traVfdCertSerial: next.certSerial,
          traVfdRegistrationId: next.registrationId,
          traVfdEfdSerial: next.efdSerial,
          traVfdReceiptCode: next.receiptCode,
          traVfdRoutingKey: next.routingKey,
        }));
        db.saveConfigurationLocal?.("tra_vfd_config", next, { tenantId: currentTenantId, branchId: currentBranchId });
      })
      .catch(() => {
        // Local configuration remains authoritative while the server is unreachable.
      });
  }, [currentTenantId, currentBranchId, db]);

  useEffect(() => {
    if (!currentTenantId || !currentBranchId || typeof navigator === "undefined" || !navigator.onLine) return;
    void apiFetch<any>("/api/v1/settings")
      .then((res) => {
        const data = res?.data || res;
        const read = (key: string) => data?.[key]?.value;
        const profileRemote = read("business.profile");
        const posRemote = read("pos.config");
        const taxRemote = read("tax.config");
        const inventoryRemote = read("inventory.config");
        const securityRemote = read("security.config");
        const notificationsRemote = read("notifications.config");
        const syncRemote = read("sync.config");
        if (profileRemote) { setProfile((v) => ({ ...v, ...profileRemote })); db.saveConfigurationLocal?.("business.profile", profileRemote, { tenantId: currentTenantId, branchId: currentBranchId }); }
        if (posRemote) { setPosConfig((v) => ({ ...v, ...posRemote })); db.saveConfigurationLocal?.("pos.config", posRemote, { tenantId: currentTenantId, branchId: currentBranchId }); }
        if (taxRemote) { setTaxConfig((v) => ({ ...v, ...taxRemote })); db.saveConfigurationLocal?.("tax.config", taxRemote, { tenantId: currentTenantId, branchId: currentBranchId }); }
        if (inventoryRemote) { setInvConfig((v) => ({ ...v, ...inventoryRemote })); db.saveConfigurationLocal?.("inventory.config", inventoryRemote, { tenantId: currentTenantId, branchId: currentBranchId }); }
        if (securityRemote) setSecurityConfig((v) => ({ ...v, ...securityRemote }));
        if (notificationsRemote) setNotificationsConfig((v) => ({ ...v, ...notificationsRemote }));
        if (syncRemote) setSyncConfig((v) => ({ ...v, ...syncRemote }));
      })
      .catch(() => {});
  }, [currentTenantId, currentBranchId, db]);

  const [posConfig, setPosConfig] = useState({
    autoPrintReceipt: true,
    kickCashDrawer: true,
    barcodeScannerMode: "KEYBOARD_EMULATION",
    maxDiscountPercent: 15,
    allowHoldOrders: true,
  });

  const [taxConfig, setTaxConfig] = useState(() => {
    try {
      const saved = db.getConfigurationLocal?.("tax.config", { tenantId: currentTenantId || "", branchId: currentBranchId || "" }) as any;
      const savedVfd = db.getConfigurationLocal?.("tra_vfd_config", { tenantId: currentTenantId || "", branchId: currentBranchId || "" }) as any;
      if (saved || savedVfd) {
        return {
          vatEnabled: Boolean(saved?.vatEnabled),
          vatRatePercent: Number(saved?.vatRatePercent ?? 0),
          currencySymbol: saved?.currencySymbol || "Tsh",
          currencyCode: saved?.currencyCode || "TZS",
          traVfdEnabled: savedVfd?.enabled ?? saved?.traVfdEnabled ?? false,
          traVfdEndpoint: savedVfd?.endpoint || saved?.traVfdEndpoint || "",
          traVfdEnvironment: (savedVfd?.environment || saved?.traVfdEnvironment || "TEST") as "TEST" | "PRODUCTION",
          traVfdTin: savedVfd?.tin || saved?.traVfdTin || "",
          traVfdCertSerial: savedVfd?.certSerial || saved?.traVfdCertSerial || "",
          traVfdRegistrationId: savedVfd?.registrationId || saved?.traVfdRegistrationId || "",
          traVfdEfdSerial: savedVfd?.efdSerial || saved?.traVfdEfdSerial || "",
          traVfdReceiptCode: savedVfd?.receiptCode || saved?.traVfdReceiptCode || "",
          traVfdRoutingKey: savedVfd?.routingKey || saved?.traVfdRoutingKey || "vfdrct",
        };
      }
    } catch {}
    return {
      vatEnabled: false,
      vatRatePercent: 0,
      currencySymbol: "Tsh",
      currencyCode: "TZS",
      traVfdEnabled: false,
      traVfdEndpoint: "",
      traVfdEnvironment: "TEST" as "TEST" | "PRODUCTION",
      traVfdTin: "",
      traVfdCertSerial: "",
      traVfdRegistrationId: "",
      traVfdEfdSerial: "",
      traVfdReceiptCode: "",
      traVfdRoutingKey: "vfdrct",
    };
  });

  const handleUpdateVfdConfig = (updates: Partial<TraVfdCardConfig>) => {
    setTaxConfig((prev) => {
      const next = {
        ...prev,
        traVfdEndpoint: updates.endpoint !== undefined ? updates.endpoint : prev.traVfdEndpoint,
        traVfdEnvironment: (updates.environment !== undefined ? updates.environment : prev.traVfdEnvironment) as "TEST" | "PRODUCTION",
        traVfdTin: updates.tin !== undefined ? updates.tin : prev.traVfdTin,
        traVfdCertSerial: updates.certSerial !== undefined ? updates.certSerial : prev.traVfdCertSerial,
        traVfdRegistrationId: updates.registrationId !== undefined ? updates.registrationId : prev.traVfdRegistrationId,
        traVfdEfdSerial: updates.efdSerial !== undefined ? updates.efdSerial : prev.traVfdEfdSerial,
        traVfdReceiptCode: updates.receiptCode !== undefined ? updates.receiptCode : prev.traVfdReceiptCode,
        traVfdRoutingKey: updates.routingKey !== undefined ? updates.routingKey : prev.traVfdRoutingKey,
      };
      db.saveConfigurationLocal?.("tra_vfd_config", {
        enabled: Boolean(next.traVfdEnabled),
        endpoint: String(next.traVfdEndpoint || "").trim(),
        environment: next.traVfdEnvironment || "TEST",
        tin: next.traVfdTin || undefined,
        certSerial: next.traVfdCertSerial || undefined,
        registrationId: next.traVfdRegistrationId || undefined,
        efdSerial: next.traVfdEfdSerial || undefined,
        receiptCode: next.traVfdReceiptCode || undefined,
        routingKey: next.traVfdRoutingKey || "vfdrct",
      }, { tenantId: currentTenantId || "", branchId: currentBranchId || "" });
      return next;
    });
  };

  const handleTraVfdToggle = async (newVal: boolean) => {
    setTaxConfig((prev) => ({ ...prev, traVfdEnabled: newVal }));
    const vfdObj = {
      enabled: newVal,
      endpoint: String(taxConfig.traVfdEndpoint || "").trim(),
      environment: taxConfig.traVfdEnvironment || "TEST",
      tin: taxConfig.traVfdTin || undefined,
      certSerial: taxConfig.traVfdCertSerial || undefined,
      registrationId: taxConfig.traVfdRegistrationId || undefined,
      efdSerial: taxConfig.traVfdEfdSerial || undefined,
      receiptCode: taxConfig.traVfdReceiptCode || undefined,
      routingKey: taxConfig.traVfdRoutingKey || "vfdrct",
    };
    db.saveConfigurationLocal?.("tra_vfd_config", vfdObj, { tenantId: currentTenantId || "", branchId: currentBranchId || "" });
    db.saveConfigurationLocal?.("tax_config", { ...taxConfig, traVfdEnabled: newVal });

    if (currentTenantId && currentBranchId && typeof navigator !== "undefined" && navigator.onLine) {
      try {
        await apiFetch("/api/v1/tra-vfd/config", {
          method: "PUT",
          body: JSON.stringify(vfdObj),
        });
        toast.success(
          newVal ? "TRA VFD Fiscalization ON" : "TRA VFD Fiscalization OFF",
          newVal
            ? "Receipts will now be cryptographically formatted and queued for TRA verification."
            : "TRA VFD signing disabled. Offline sales will not require fiscal signatures."
        );
      } catch (err: any) {
        toast.warning("Saved Locally", "Terminal updated local VFD state. Server sync will retry.");
      }
    } else {
      toast.info(
        newVal ? "TRA VFD ON (Offline Mode)" : "TRA VFD OFF (Offline Mode)",
        "Local terminal setting applied. Will synchronize with cloud when reconnected."
      );
    }
  };

  const [invConfig, setInvConfig] = useState({
    enforceFefoBatching: true,
    allowNegativeStock: false,
    defaultLowStockThreshold: 10,
    barcodePrefix: "200",
  });

  const [securityConfig, setSecurityConfig] = useState({
    inactivityLockMinutes: 15,
    managerPinPolicy: "6-digit numeric PIN",
  });
  const [notificationsConfig, setNotificationsConfig] = useState({
    lowStockAlerts: true,
    dailySummaryEmail: false,
    smsGatewayEnabled: false,
  });
  const [syncConfig, setSyncConfig] = useState({
    backgroundSyncEnabled: true,
    retryBackoff: "EXPONENTIAL",
    conflictPolicy: "SERVER_AUTHORITATIVE",
  });

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentTenantId || !currentBranchId) {
      toast.error("Tenant Context Required", "Settings require an authenticated tenant and branch.");
      return;
    }
    try {
      await db.enqueueSettingsMutations(
        [
          { key: "business.profile", value: profile, scope: "BRANCH" },
          { key: "pos.config", value: posConfig, scope: "BRANCH" },
          { key: "tax.config", value: taxConfig, scope: "BRANCH" },
          { key: "inventory.config", value: invConfig, scope: "BRANCH" },
          { key: "security.config", value: securityConfig, scope: "BRANCH" },
          { key: "notifications.config", value: notificationsConfig, scope: "BRANCH" },
          { key: "sync.config", value: syncConfig, scope: "BRANCH" },
        ],
        { tenantId: currentTenantId, branchId: currentBranchId, userId: "" },
      );
      setSavedSuccess(true);
      toast.success("Settings Saved", "Changes are durably persisted and queued for authoritative synchronization.");
      window.dispatchEvent(new CustomEvent("kwakopos:context-sync-now"));
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error: any) {
      setSavedSuccess(false);
      toast.error("Settings Save Failed", error?.message || "The settings mutation could not be committed.");
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
    { id: "profile", label: t("settings.tabProfile"), icon: Building },
    { id: "localization", label: t("settings.tabLocalization"), icon: Globe },
    { id: "pos", label: t("settings.tabPos"), icon: Printer },
    { id: "tax", label: t("settings.tabTax"), icon: Scale },
    { id: "fiscal", label: "Fiscal Device (TRA)", icon: ShieldCheck },
    { id: "inventory", label: t("settings.tabInventory"), icon: Package },
    { id: "security", label: t("settings.tabSecurity"), icon: Shield },
    { id: "notifications", label: t("settings.tabNotifications"), icon: Bell },
    { id: "sync", label: t("settings.tabSync"), icon: RefreshCw },
    { id: "integrations", label: t("settings.tabIntegrations"), icon: Zap },
    { id: "developer", label: t("settings.tabDeveloper"), icon: Sliders },
    { id: "advanced", label: t("settings.tabAdvanced"), icon: Database },
  ];

  const now = new Date();

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            {t("settings.title")}
          </h1>
          <p className="v2-text-xs v2-text-muted">
            {t("settings.enterpriseConfig")}
          </p>
        </div>
        <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => void handleSave()} type="button" disabled={!canManageSettings} title={!canManageSettings ? "settings.manage permission is required" : undefined}>
          <Save size={13} /> {t("settings.saveChanges")}
        </button>
      </div>

      {savedSuccess && (
        <div className="v2-card" style={{ padding: ".75rem 1rem", background: "var(--success-muted)", borderColor: "var(--success)", color: "var(--success)" }}>
          <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold">
            <CheckCircle size={15} /> {t("settings.changesSaved")}
          </div>
        </div>
      )}

      {/* 10-Tab Navigation */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem", overflowX: "auto" }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => selectSettingsTab(tab.id)}
              type="button"
              className={`v2-btn v2-btn-sm ${isActive ? "v2-btn-primary" : "v2-btn-ghost"}`}
              style={{ whiteSpace: "nowrap" }}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Profile Settings */}
      {activeTab === "profile" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabProfile")}</div></div>
          <form onSubmit={handleSave} className="v2-space-y-4">
            <div className="v2-grid v2-grid-2 v2-gap-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.businessName")}</label>
                <input className="v2-input" value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} required />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.tradingName")}</label>
                <input className="v2-input" value={profile.tradingName} onChange={(e) => setProfile({ ...profile, tradingName: e.target.value })} />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.tinNumber")}</label>
                <input className="v2-input" value={profile.tinNumber} onChange={(e) => setProfile({ ...profile, tinNumber: e.target.value })} required />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.vrnNumber")}</label>
                <input className="v2-input" value={profile.vrnNumber} onChange={(e) => setProfile({ ...profile, vrnNumber: e.target.value })} />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.email")}</label>
                <input className="v2-input" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.phone")}</label>
                <input className="v2-input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.address")}</label>
              <textarea className="v2-input" rows={2} value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            </div>
          </form>
        </div>
      )}

      {/* Localization Settings */}
      {activeTab === "localization" && (
        <div className="v2-space-y-4">
          <div className="v2-card">
            <div className="v2-card-header">
              <div>
                <div className="v2-card-title">{t("settings.interfaceLanguage")}</div>
                <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".15rem" }}>
                  {t("settings.interfaceLanguageHelp")}
                </div>
              </div>
            </div>
            <div className="v2-grid v2-grid-3 v2-gap-4">
              {availableLocales.map((loc) => {
                const isSelected = locale === loc.code;
                return (
                  <div
                    key={loc.code}
                    onClick={() => setLocale(loc.code)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLocale(loc.code); }}
                    className="v2-card"
                    style={{
                      cursor: "pointer",
                      padding: "1.25rem",
                      borderColor: isSelected ? "var(--primary)" : "var(--surface-border)",
                      background: isSelected ? "var(--primary-muted)" : "var(--surface-card)",
                      transition: "all 0.15s ease",
                      position: "relative",
                    }}
                  >
                    <div className="v2-flex v2-items-start v2-justify-between v2-mb-2">
                      <div className="v2-flex v2-items-center v2-gap-2">
                        <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>{loc.flag}</span>
                        <div>
                          <div className="v2-font-black v2-text-sm" style={{ color: isSelected ? "var(--primary)" : "var(--text-primary)" }}>
                            {loc.nativeName}
                          </div>
                          <div className="v2-text-xs v2-text-muted">{loc.name}</div>
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="badge v2-badge-success v2-flex v2-items-center v2-gap-1">
                          <Check size={11} /> {t("common.active")}
                        </span>
                      ) : (
                        <span className="badge v2-badge-muted">{loc.code.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".75rem", lineHeight: 1.4 }}>
                      {loc.code === "en" && "Official commercial and international trade terminology with global standard notation."}
                      {loc.code === "fr" && "Terminologie commerciale conforme aux normes OHADA et au français d'affaires."}
                      {loc.code === "sw" && "Lugha ya kibiashara ya Afrika Mashariki iliyorahisishwa kwa wajasiriamali na wafanyabiashara."}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Regional Format Live Preview */}
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title">Live Localization & Formatting Preview ({locale.toUpperCase()})</div>
            </div>
            <div className="v2-grid v2-grid-4 v2-gap-4">
              <div className="v2-card" style={{ padding: "1rem", background: "var(--surface-bg)" }}>
                <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-text-muted v2-mb-1">
                  <DollarSign size={14} /> Currency (TZS)
                </div>
                <div className="v2-text-base v2-font-black">{formatCurrency(12450000, "TZS")}</div>
                <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".25rem" }}>
                  Compact: <span className="v2-font-bold">{formatMoneyCompact(12450000)}</span>
                </div>
              </div>

              <div className="v2-card" style={{ padding: "1rem", background: "var(--surface-bg)" }}>
                <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-text-muted v2-mb-1">
                  <Calendar size={14} /> Full Date
                </div>
                <div className="v2-text-sm v2-font-black">{formatDate(now, { dateStyle: "full" })}</div>
                <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".25rem" }}>
                  Short: <span className="v2-font-bold">{formatDate(now, { dateStyle: "short" })}</span>
                </div>
              </div>

              <div className="v2-card" style={{ padding: "1rem", background: "var(--surface-bg)" }}>
                <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-text-muted v2-mb-1">
                  <Calendar size={14} /> Local Time
                </div>
                <div className="v2-text-base v2-font-black">{formatTime(now)}</div>
                <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".25rem" }}>
                  Active 24h/12h local clock
                </div>
              </div>

              <div className="v2-card" style={{ padding: "1rem", background: "var(--surface-bg)" }}>
                <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-text-muted v2-mb-1">
                  <Hash size={14} /> {t("settings.numberFormatLabel")}
                </div>
                <div className="v2-text-base v2-font-black">{formatNumber(1234567.89)}</div>
                <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".25rem" }}>
                  Locale grouping separator
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS Settings */}
      {activeTab === "pos" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabPos")}</div></div>
          <div className="v2-space-y-4">
            <div className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div>
                <div className="v2-font-bold v2-text-sm">{t("settings.autoPrintReceipt")}</div>
                <div className="v2-text-xs v2-text-muted">Automatically send 80mm thermal receipt upon completed transaction</div>
              </div>
              <input type="checkbox" checked={posConfig.autoPrintReceipt} onChange={(e) => setPosConfig({ ...posConfig, autoPrintReceipt: e.target.checked })} />
            </div>
            <div className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div>
                <div className="v2-font-bold v2-text-sm">{t("settings.kickCashDrawer")}</div>
                <div className="v2-text-xs v2-text-muted">Pulse RJ11 cash drawer trigger signal on cash checkout</div>
              </div>
              <input type="checkbox" checked={posConfig.kickCashDrawer} onChange={(e) => setPosConfig({ ...posConfig, kickCashDrawer: e.target.checked })} />
            </div>
            <div className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div>
                <div className="v2-font-bold v2-text-sm">{t("settings.allowHoldOrders")}</div>
                <div className="v2-text-xs v2-text-muted">Allow cashiers to park pending customer baskets</div>
              </div>
              <input type="checkbox" checked={posConfig.allowHoldOrders} onChange={(e) => setPosConfig({ ...posConfig, allowHoldOrders: e.target.checked })} />
            </div>
          </div>
        </div>
      )}

      {/* Tax & Currency Settings */}
      {activeTab === "tax" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabTax")}</div></div>
          <div className="v2-space-y-4">
            <div className="v2-grid v2-grid-2 v2-gap-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.vatRate")}</label>
                <input className="v2-input" type="number" value={taxConfig.vatRatePercent} onChange={(e) => setTaxConfig({ ...taxConfig, vatRatePercent: Number(e.target.value) })} />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{t("settings.currencySymbol")}</label>
                <input className="v2-input" value={taxConfig.currencySymbol} onChange={(e) => setTaxConfig({ ...taxConfig, currencySymbol: e.target.value })} />
              </div>
            </div>
            {/* Quick TRA VFD Fiscal Device Card */}
            <TraVfdFiscalizationCard
              config={{
                enabled: Boolean(taxConfig.traVfdEnabled),
                endpoint: taxConfig.traVfdEndpoint || "",
                environment: taxConfig.traVfdEnvironment || "TEST",
                tin: taxConfig.traVfdTin || "",
                certSerial: taxConfig.traVfdCertSerial || "",
                registrationId: taxConfig.traVfdRegistrationId || "",
                efdSerial: taxConfig.traVfdEfdSerial || "",
                receiptCode: taxConfig.traVfdReceiptCode || "",
                routingKey: taxConfig.traVfdRoutingKey || "vfdrct",
              }}
              onConfigChange={handleUpdateVfdConfig}
              onToggle={handleTraVfdToggle}
              isCompact={true}
              onOpenFullSettings={() => selectSettingsTab("fiscal")}
            />
          </div>
        </div>
      )}

      {/* Fiscal Device (TRA VFD) Dedicated Command Center Tab */}
      {activeTab === "fiscal" && (
        <div className="v2-space-y-4">
          <TraVfdFiscalizationCard
            config={{
              enabled: Boolean(taxConfig.traVfdEnabled),
              endpoint: taxConfig.traVfdEndpoint || "",
              environment: taxConfig.traVfdEnvironment || "TEST",
              tin: taxConfig.traVfdTin || "",
              certSerial: taxConfig.traVfdCertSerial || "",
              registrationId: taxConfig.traVfdRegistrationId || "",
              efdSerial: taxConfig.traVfdEfdSerial || "",
              receiptCode: taxConfig.traVfdReceiptCode || "",
              routingKey: taxConfig.traVfdRoutingKey || "vfdrct",
            }}
            onConfigChange={handleUpdateVfdConfig}
            onToggle={handleTraVfdToggle}
          />

          {/* Compliance & Offline Tolerance Rules */}
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
                <ShieldCheck size={18} className="v2-text-accent" />
                <span>TRA Legal Compliance &amp; Offline Tolerance Rules</span>
              </div>
            </div>
            <div className="v2-card-body v2-space-y-3">
              <div className="v2-text-xs v2-text-muted">
                KwakoPos v2 provides authoritative EFDMS/VFD compliance certified under the Tanzania Revenue Authority (TRA) electronic fiscal receipt framework:
              </div>
              <div className="v2-grid v2-grid-3 v2-gap-3">
                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--surface-border)" }}>
                  <div className="v2-font-bold v2-text-xs v2-mb-1">1. Zero Cashier Blocking</div>
                  <div className="v2-text-xs v2-text-muted">
                    If TRA servers or branch Internet disconnect, transactions immediately complete locally with a pending fiscal token. Cashier checkouts are never blocked.
                  </div>
                </div>
                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--surface-border)" }}>
                  <div className="v2-font-bold v2-text-xs v2-mb-1">2. Durable Outbox Queue</div>
                  <div className="v2-text-xs v2-text-muted">
                    Pending receipts queue in encrypted IndexedDB. Once connectivity returns, the background worker transmits and reconciles them with exponential backoff.
                  </div>
                </div>
                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--surface-border)" }}>
                  <div className="v2-font-bold v2-text-xs v2-mb-1">3. QR &amp; Verification Code</div>
                  <div className="v2-text-xs v2-text-muted">
                    Fiscal receipts generate official verification URLs and QR codes verifiable by TRA receipt check scanners and customer mobile devices.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Settings */}
      {activeTab === "inventory" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabInventory")}</div></div>
          <div className="v2-space-y-4">
            <div className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div>
                <div className="v2-font-bold v2-text-sm">Enforce FEFO Batching</div>
                <div className="v2-text-xs v2-text-muted">First-Expiring-First-Out picking recommendation on checkout</div>
              </div>
              <input type="checkbox" checked={invConfig.enforceFefoBatching} onChange={(e) => setInvConfig({ ...invConfig, enforceFefoBatching: e.target.checked })} />
            </div>
            <div className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div>
                <div className="v2-font-bold v2-text-sm">Allow Negative Stock Override</div>
                <div className="v2-text-xs v2-text-muted">Permit checkout when stock level drops below zero</div>
              </div>
              <input type="checkbox" checked={invConfig.allowNegativeStock} onChange={(e) => setInvConfig({ ...invConfig, allowNegativeStock: e.target.checked })} />
            </div>
          </div>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === "security" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabSecurity")}</div></div>
          <div className="v2-space-y-3">
            <div className="v2-text-xs v2-text-muted">Security policy changes are tenant/branch settings and use the canonical durable Settings pipeline.</div>
            <div className="v2-grid v2-grid-2 v2-gap-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Cashier Inactivity Lock (Minutes)</label>
                <input className="v2-input" type="number" min={1} value={securityConfig.inactivityLockMinutes} onChange={(e) => setSecurityConfig({ ...securityConfig, inactivityLockMinutes: Number(e.target.value) })} />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Manager Approval PIN Policy</label>
                <select className="v2-input" value={securityConfig.managerPinPolicy} onChange={(e) => setSecurityConfig({ ...securityConfig, managerPinPolicy: e.target.value })}>
                  <option>6-digit numeric PIN</option>
                  <option>Password + Biometric</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}}

      {/* Production-safe developer diagnostics: sample/demo data injection is deliberately unavailable. */}
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">Production Data Policy</div>
        </div>
        <div className="v2-card-body v2-space-y-2">
          <div className="v2-text-sm v2-font-bold">Clean tenant initialization is enforced.</div>
          <div className="v2-text-xs v2-text-muted">
            Categories, brands, products, customers, suppliers, sales, expenses, receipts, and stock are created only from real business actions or authoritative synchronization. Sample/demo injection is not available in the production UI.
          </div>
        </div>
      </div>
          {/* Database Diagnostics & Developer Telemetry */}
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
                <Database size={16} className="v2-text-accent" />
                <span>Developer Diagnostics &amp; System Telemetry</span>
              </div>
            </div>
            <div className="v2-card-body v2-space-y-3">
              <div className="v2-text-xs v2-text-muted v2-flex v2-items-center v2-gap-2 v2-flex-wrap">
                <span>Offline IndexedDB storage engine is operating under authoritative schema version 4. Workspace sync is active and isolated to tenant <strong>{currentTenantName}</strong></span>
                {currentTenantId && (
                  <HumanIdBadge
                    fullId={currentTenantId}
                    displayCode={currentTenantSlug || undefined}
                    prefix="TNT"
                    size="xs"
                    variant="tenant"
                  />
                )}
              </div>
              <div className="v2-grid v2-grid-3 v2-gap-3">
                <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="v2-text-xs v2-text-muted">Active Products</div>
                  <div className="v2-text-base v2-font-bold">{db?.products?.size || 0} items</div>
                </div>
                <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="v2-text-xs v2-text-muted">Stored Sales Records</div>
                  <div className="v2-text-base v2-font-bold">{db?.sales?.size || 0} records</div>
                </div>
                <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="v2-text-xs v2-text-muted">Customer Accounts</div>
                  <div className="v2-text-base v2-font-bold">{db?.customers?.size || 0} accounts</div>
                </div>
              </div>
            </div>
          </div>

      {/* Advanced Settings & Danger Zone */}
      {activeTab === "advanced" && (
        <div className="v2-space-y-4">
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
                <Database size={16} className="v2-text-accent" />
                <span>Enterprise Database Diagnostics &amp; System Telemetry</span>
              </div>
            </div>
            <div className="v2-card-body v2-space-y-3">
              <div className="v2-text-xs v2-text-muted v2-flex v2-items-center v2-gap-2 v2-flex-wrap">
                <span>Offline IndexedDB storage engine is operating under authoritative schema version 4. Workspace sync is active and isolated to tenant <strong>{currentTenantName}</strong></span>
                {currentTenantId && (
                  <HumanIdBadge
                    fullId={currentTenantId}
                    displayCode={currentTenantSlug || undefined}
                    prefix="TNT"
                    size="xs"
                    variant="tenant"
                  />
                )}
              </div>
              <div className="v2-grid v2-grid-3 v2-gap-3">
                <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="v2-text-xs v2-text-muted">Active Products</div>
                  <div className="v2-text-base v2-font-bold">{db?.products?.size || 0} items</div>
                </div>
                <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="v2-text-xs v2-text-muted">Stored Sales Records</div>
                  <div className="v2-text-base v2-font-bold">{db?.sales?.size || 0} records</div>
                </div>
                <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="v2-text-xs v2-text-muted">Customer Accounts</div>
                  <div className="v2-text-base v2-font-bold">{db?.customers?.size || 0} accounts</div>
                </div>
              </div>
            </div>
          </div>

          {/* Developer Options & Sample Data Shortcut */}
          <div className="v2-card v2-p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--surface-border)" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-gap-3" style={{ flexWrap: "wrap" }}>
              <div className="v2-flex v2-items-center v2-gap-3">
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(245, 158, 11, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f59e0b",
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="v2-font-bold v2-text-sm" style={{ color: "var(--text)" }}>Developer Diagnostics</div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: "2px" }}>
                    Inspect authoritative local persistence, synchronization, release information, and safe production maintenance controls.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={() => setActiveTab("developer")}
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>Open Diagnostics</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>

          {/* Danger Zone: Store Cleanliness */}
          <div
            className="v2-card"
            style={{
              border: "1px solid rgba(248, 113, 113, 0.35)",
              background: "linear-gradient(180deg, rgba(248, 113, 113, 0.04) 0%, transparent 100%)",
            }}
          >
            <div
              className="v2-card-header"
              style={{ borderBottom: "1px solid rgba(248, 113, 113, 0.2)" }}
            >
              <div className="v2-flex v2-items-center v2-justify-between">
                <div className="v2-card-title v2-flex v2-items-center v2-gap-2" style={{ color: "var(--danger, #f87171)" }}>
                  <AlertTriangle size={18} />
                  <span>Store Data Cleanliness &amp; Danger Zone</span>
                </div>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "rgba(248, 113, 113, 0.15)",
                    color: "var(--danger, #f87171)",
                    border: "1px solid rgba(248, 113, 113, 0.3)",
                  }}
                >
                  Strict 2s Hold Required
                </span>
              </div>
            </div>

            <div className="v2-card-body v2-space-y-4">
              <div className="v2-text-xs v2-text-muted">
                These operations permanently purge data for <strong>{currentTenantName}</strong> from this terminal's local IndexedDB and the cloud database.
                To prevent accidental loss, each action requires a continuous <strong>2-second press-and-hold</strong>.
              </div>

              {/* Danger Operation 1: Purge Products */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "var(--radius-md, 0.55rem)",
                  background: "var(--surface-2, #243047)",
                  border: "1px solid var(--surface-border, #334155)",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="v2-font-bold v2-text-sm" style={{ color: "var(--text)" }}>
                    Purge Catalog, Variants &amp; Stock Ledgers
                  </div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.2rem" }}>
                    Permanently deletes all products, barcodes, batches, and inventory ledger movements for this store.
                  </div>
                </div>
                <HoldToConfirmButton
                  label="Hold 2s to Purge Products"
                  holdingLabel="Purging Products..."
                  completedLabel="Products Purged"
                  variant="danger"
                  onConfirm={async () => {
                    if (!currentTenantId) {
                      toast.error("Tenant Context Required", "Cannot purge store data without an active tenant context.");
                      return;
                    }
                    const result = await tenantStoreCleanupService.purgeProductsAndLedgers(currentTenantId, db);
                    toast.success(
                      "Products & Ledgers Purged",
                      `Removed ${result.purgedCounts.products || 0} products and ${result.purgedCounts.stockLedger || 0} ledger records.`,
                    );
                  }}
                />
              </div>

              {/* Danger Operation 2: Purge Sales */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "var(--radius-md, 0.55rem)",
                  background: "var(--surface-2, #243047)",
                  border: "1px solid var(--surface-border, #334155)",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="v2-font-bold v2-text-sm" style={{ color: "var(--text)" }}>
                    Purge Point-of-Sale Receipts &amp; Orders
                  </div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.2rem" }}>
                    Deletes historical receipts, order transactions, payments, and sanitizes pending sales outbox queues.
                  </div>
                </div>
                <HoldToConfirmButton
                  label="Hold 2s to Purge Sales"
                  holdingLabel="Purging Sales..."
                  completedLabel="Sales Purged"
                  variant="danger"
                  onConfirm={async () => {
                    if (!currentTenantId) {
                      toast.error("Tenant Context Required", "Cannot purge store data without an active tenant context.");
                      return;
                    }
                    const result = await tenantStoreCleanupService.purgeSalesAndReceipts(currentTenantId, db);
                    toast.success(
                      "Sales & Receipts Purged",
                      `Removed ${result.purgedCounts.sales || 0} sales, ${result.purgedCounts.receipts || 0} receipts, and cleared outbox.`,
                    );
                  }}
                />
              </div>

              {/* Danger Operation 3: Purge Contacts */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "var(--radius-md, 0.55rem)",
                  background: "var(--surface-2, #243047)",
                  border: "1px solid var(--surface-border, #334155)",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="v2-font-bold v2-text-sm" style={{ color: "var(--text)" }}>
                    Purge Customer Accounts &amp; Suppliers
                  </div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.2rem" }}>
                    Clears customer directories, balance ledgers, member accounts, and registered supplier contacts.
                  </div>
                </div>
                <HoldToConfirmButton
                  label="Hold 2s to Purge Contacts"
                  holdingLabel="Purging Contacts..."
                  completedLabel="Contacts Purged"
                  variant="danger"
                  onConfirm={async () => {
                    if (!currentTenantId) {
                      toast.error("Tenant Context Required", "Cannot purge store data without an active tenant context.");
                      return;
                    }
                    const result = await tenantStoreCleanupService.purgeContactsAndExpenses(currentTenantId, db);
                    toast.success(
                      "Contacts & Suppliers Purged",
                      `Removed ${result.purgedCounts.customers || 0} customers and ${result.purgedCounts.suppliers || 0} suppliers.`,
                    );
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <div className="v2-space-y-4">
          {/* TRA VFD Integration Card */}
          <TraVfdFiscalizationCard
            config={{
              enabled: Boolean(taxConfig.traVfdEnabled),
              endpoint: taxConfig.traVfdEndpoint || "",
              environment: taxConfig.traVfdEnvironment || "TEST",
              tin: taxConfig.traVfdTin || "",
              certSerial: taxConfig.traVfdCertSerial || "",
              registrationId: taxConfig.traVfdRegistrationId || "",
              efdSerial: taxConfig.traVfdEfdSerial || "",
              receiptCode: taxConfig.traVfdReceiptCode || "",
              routingKey: taxConfig.traVfdRoutingKey || "vfdrct",
            }}
            onConfigChange={handleUpdateVfdConfig}
            onToggle={handleTraVfdToggle}
            onOpenFullSettings={() => selectSettingsTab("fiscal")}
          />

          {/* Payment Gateways Card */}
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
                <CreditCard size={18} />
                <span>Mobile Money & Banking Gateways</span>
              </div>
            </div>
            <div className="v2-card-body v2-space-y-3">
              <div className="v2-grid v2-grid-3 v2-gap-3">
                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--surface-border)" }}>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <strong className="v2-text-xs">Vodacom M-Pesa</strong>
                    <span className="v2-badge v2-badge-sm" style={{ color: "#10b981" }}>CONFIGURE</span>
                  </div>
                  <div className="v2-text-xs v2-text-muted">Provider integration availability; configure credentials and webhooks before activation.</div>
                </div>

                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--surface-border)" }}>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <strong className="v2-text-xs">Airtel Money</strong>
                    <span className="v2-badge v2-badge-sm" style={{ color: "#10b981" }}>READY</span>
                  </div>
                  <div className="v2-text-xs v2-text-muted">Provider integration availability; configure credentials and settlement mapping before activation.</div>
                </div>

                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--surface-border)" }}>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <strong className="v2-text-xs">CRDB / NMB Bank</strong>
                    <span className="v2-badge v2-badge-sm" style={{ color: "#10b981" }}>READY</span>
                  </div>
                  <div className="v2-text-xs v2-text-muted">Provider integration availability; configure bank integration credentials before activation.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications & Sync Tabs */}
      {activeTab === "notifications" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabNotifications")}</div></div>
          <div className="v2-card-body v2-space-y-3">
            <label className="v2-flex v2-items-center v2-justify-between"><span className="v2-text-sm">Low stock alerts</span><input type="checkbox" checked={notificationsConfig.lowStockAlerts} onChange={(e) => setNotificationsConfig({ ...notificationsConfig, lowStockAlerts: e.target.checked })} /></label>
            <label className="v2-flex v2-items-center v2-justify-between"><span className="v2-text-sm">Daily summary email</span><input type="checkbox" checked={notificationsConfig.dailySummaryEmail} onChange={(e) => setNotificationsConfig({ ...notificationsConfig, dailySummaryEmail: e.target.checked })} /></label>
            <label className="v2-flex v2-items-center v2-justify-between"><span className="v2-text-sm">SMS gateway alerts</span><input type="checkbox" checked={notificationsConfig.smsGatewayEnabled} onChange={(e) => setNotificationsConfig({ ...notificationsConfig, smsGatewayEnabled: e.target.checked })} /></label>
          </div>
        </div>
      )}

      {activeTab === "sync" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">{t("settings.tabSync")}</div></div>
          <div className="v2-card-body v2-space-y-3">
            <div className="v2-text-xs v2-text-muted">Settings synchronization uses the durable local outbox, PostgreSQL authority, monotonic revision journal, and server-authoritative conflict policy.</div>
            <label className="v2-flex v2-items-center v2-justify-between"><span className="v2-text-sm">Background sync</span><input type="checkbox" checked={syncConfig.backgroundSyncEnabled} onChange={(e) => setSyncConfig({ ...syncConfig, backgroundSyncEnabled: e.target.checked })} /></label>
            <div className="v2-text-xs v2-text-muted">Retry: {syncConfig.retryBackoff} · Conflict policy: {syncConfig.conflictPolicy}</div>
          </div>
        </div>
      )}}
    </div>
  );
};







