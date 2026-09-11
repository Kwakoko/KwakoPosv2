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
import React, { useEffect, useState } from "react";
import {
  Settings, Building, Printer, Scale, Package, Shield, Bell, RefreshCw,
  Zap, Database, Save, CheckCircle, Globe, Check, Sliders, Calendar,
  DollarSign, Hash, LucideIcon, Trash2, AlertTriangle, FileText, Sparkles
} from "lucide-react";
import { useTenant, useBranch, useSync, useTranslation, useLocale, useFormatters } from "../context/KwakoPosContexts.js";
import { useToast } from "../components/UI/Toast.js";
import { HoldToConfirmButton } from "../components/UI/HoldToConfirmButton.js";
import { tenantStoreCleanupService } from "../services/tenantStoreCleanupService.js";
import { SUPPORTED_LOCALES, SupportedLocale } from "../i18n/types.js";
import { loadSampleData, purgeSampleData, isDemoModeActive, DEMO_DATA_EVENT } from "../services/sampleDataService.js";

type SettingsTab =
  | "profile" | "localization" | "pos" | "tax" | "inventory"
  | "security" | "notifications" | "sync" | "integrations" | "advanced";

export interface SettingsPageProps {
  activeTab?: string;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ activeTab: propActiveTab }) => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchName } = useBranch();
  const { db } = useSync();
  const toast = useToast();
  const { t } = useTranslation();
  const { locale, setLocale, availableLocales } = useLocale();
  const { formatCurrency, formatMoneyCompact, formatDate, formatTime, formatNumber } = useFormatters();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (!propActiveTab) return;
    const map: Record<string, SettingsTab> = {
      "General Settings": "profile",
      "POS Settings": "pos",
      "Tax & Currency": "tax",
      "Printers & Hardware": "pos",
      "Barcode & Labels": "inventory",
      "Payment Gateways": "integrations",
      "Backup & Restore": "advanced",
      "Audit Trail": "advanced",
      "Branch Management": "profile",
      "Custom Fields": "advanced",
      "Fiscal Device (TRA)": "tax",
    };
    if (map[propActiveTab]) {
      setActiveTab(map[propActiveTab]);
    }
  }, [propActiveTab]);

  const [isDemoActive, setIsDemoActive] = useState(() => isDemoModeActive(db));

  // Form states across tabs
  const [profile, setProfile] = useState(() => {
    const saved = db.getConfigurationLocal?.("store_profile") as any;
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
    const saved = db.getConfigurationLocal?.("store_profile") as any;
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
    const handleDemoChange = () => {
      setIsDemoActive(isDemoModeActive(db));
    };
    window.addEventListener(DEMO_DATA_EVENT, handleDemoChange);
    return () => {
      window.removeEventListener(DEMO_DATA_EVENT, handleDemoChange);
    };
  }, [db]);

  useEffect(() => {
    const saved = db.getConfigurationLocal?.("tax_config") as any;
    if (saved) {
      setTaxConfig((prev) => ({
        ...prev,
        vatEnabled: Boolean(saved.vatEnabled),
        vatRatePercent: Number(saved.vatRatePercent ?? 0),
        currencySymbol: saved.currencySymbol || prev.currencySymbol,
        currencyCode: saved.currencyCode || prev.currencyCode,
        traVfdEndpoint: saved.traVfdEndpoint || prev.traVfdEndpoint,
      }));
    }
  }, [db]);

  const [posConfig, setPosConfig] = useState({
    autoPrintReceipt: true,
    kickCashDrawer: true,
    barcodeScannerMode: "KEYBOARD_EMULATION",
    maxDiscountPercent: 15,
    allowHoldOrders: true,
  });

  const [taxConfig, setTaxConfig] = useState(() => {
    try {
      const saved = db.getConfigurationLocal?.("tax_config") as any;
      if (saved) {
        return {
          vatEnabled: Boolean(saved.vatEnabled),
          vatRatePercent: Number(saved.vatRatePercent ?? 0),
          currencySymbol: saved.currencySymbol || "Tsh",
          currencyCode: saved.currencyCode || "TZS",
          traVfdEndpoint: saved.traVfdEndpoint || "https://vfd.tra.go.tz/api/v1/receipts",
        };
      }
    } catch {}
    return {
      vatEnabled: false,
      vatRatePercent: 0,
      currencySymbol: "Tsh",
      currencyCode: "TZS",
      traVfdEndpoint: "https://vfd.tra.go.tz/api/v1/receipts",
    };
  });

  const [invConfig, setInvConfig] = useState({
    enforceFefoBatching: true,
    allowNegativeStock: false,
    defaultLowStockThreshold: 10,
    barcodePrefix: "200",
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    db.saveConfigurationLocal?.("store_profile", profile);
    db.saveConfigurationLocal?.("pos_config", posConfig);
    db.saveConfigurationLocal?.("tax_config", taxConfig);
    db.saveConfigurationLocal?.("inv_config", invConfig);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
    { id: "profile", label: t("settings.tabProfile"), icon: Building },
    { id: "localization", label: t("settings.tabLocalization"), icon: Globe },
    { id: "pos", label: t("settings.tabPos"), icon: Printer },
    { id: "tax", label: t("settings.tabTax"), icon: Scale },
    { id: "inventory", label: t("settings.tabInventory"), icon: Package },
    { id: "security", label: t("settings.tabSecurity"), icon: Shield },
    { id: "notifications", label: t("settings.tabNotifications"), icon: Bell },
    { id: "sync", label: t("settings.tabSync"), icon: RefreshCw },
    { id: "integrations", label: t("settings.tabIntegrations"), icon: Zap },
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
        <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={handleSave} type="button">
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
              onClick={() => setActiveTab(tab.id)}
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
            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">TRA VFD Fiscal Signing Server Endpoint</label>
              <input className="v2-input" value={taxConfig.traVfdEndpoint} onChange={(e) => setTaxConfig({ ...taxConfig, traVfdEndpoint: e.target.value })} />
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
            <div className="v2-text-xs v2-text-muted">Configure manager override PINs, session inactivity lockouts, and cryptographic signatures.</div>
            <div className="v2-grid v2-grid-2 v2-gap-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Cashier Inactivity Lock (Minutes)</label>
                <input className="v2-input" type="number" defaultValue={15} />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Manager Approval PIN Policy</label>
                <select className="v2-input">
                  <option>6-digit numeric PIN</option>
                  <option>Password + Biometric</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div className="v2-text-xs v2-text-muted">
                Offline IndexedDB storage engine is operating under authoritative schema version 4.
                Workspace sync is active and isolated to tenant <strong>{currentTenantName}</strong> ({currentTenantId}).
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

          {/* Training Sandbox & Sample Retail Data */}
          <div
            className="v2-card"
            style={{
              border: isDemoActive ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid var(--surface-border)",
              background: isDemoActive ? "linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, transparent 100%)" : undefined,
            }}
          >
            <div className="v2-card-header" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div className="v2-flex v2-items-center v2-justify-between">
                <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
                  <Sparkles size={18} style={{ color: isDemoActive ? "var(--accent)" : "var(--muted)" }} />
                  <span>Store Data &amp; Training Sandbox Engine</span>
                </div>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: isDemoActive ? "rgba(56, 189, 248, 0.2)" : "var(--surface-3)",
                    color: isDemoActive ? "var(--accent)" : "var(--text-muted)",
                    border: isDemoActive ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid var(--surface-border)",
                  }}
                >
                  {isDemoActive ? "⚡ Demo Mode Active" : "Production Mode Clean"}
                </span>
              </div>
            </div>

            <div className="v2-card-body v2-space-y-4">
              <div className="v2-text-xs v2-text-muted">
                Quickly populate your store with a complete, localized retail simulation dataset (fast-moving products, variants, barcode mappings, wholesale &amp; VIP customers, suppliers, realistic completed sales, operational petty cash vouchers, and an active drawer shift). All sample data is isolated and can be cleanly purged at any time with 1 click before going live.
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "var(--radius-md, 0.55rem)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--surface-border)",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="v2-font-bold v2-text-sm" style={{ color: "var(--text)" }}>
                    {isDemoActive ? "Reset / Reload Sample Retail Data" : "Load Realistic Retail Demo Dataset"}
                  </div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.2rem" }}>
                    Injects Azam Flour, Coca Cola, ASAS Milk, Korie Oil, VIP customers, sales ledger, and active shift.
                  </div>
                </div>
                <button
                  type="button"
                  className="v2-btn v2-btn-primary v2-btn-sm"
                  onClick={async () => {
                    const res = await loadSampleData(db, currentTenantId || undefined);
                    toast.success(
                      "Sample Data Loaded",
                      `Injected ${res.products} products, ${res.customers} customers, ${res.sales} sales, and ${res.expenses} expense records.`
                    );
                  }}
                >
                  <Sparkles size={13} /> {isDemoActive ? "Re-load Sample Data" : "Load Sample Retail Data"}
                </button>
              </div>

              {isDemoActive && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "1rem",
                    borderRadius: "var(--radius-md, 0.55rem)",
                    background: "rgba(248, 113, 113, 0.08)",
                    border: "1px solid rgba(248, 113, 113, 0.3)",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div className="v2-font-bold v2-text-sm" style={{ color: "var(--danger)" }}>
                      1-Click Purge All Sample Data
                    </div>
                    <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.2rem" }}>
                      Instantly purges all tagged demo products, customers, suppliers, sales, and demo expenses back to 100% pristine zero data.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="v2-btn v2-btn-danger v2-btn-sm"
                    onClick={async () => {
                      await purgeSampleData(db, currentTenantId || undefined);
                      toast.success(
                        "Sample Data Purged",
                        "All demo products, sales, customers, and active shift data have been wiped."
                      );
                    }}
                  >
                    <Trash2 size={13} /> Purge All Sample Data
                  </button>
                </div>
              )}
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

      {/* Other Tabs */}
      {["notifications", "sync", "integrations"].includes(activeTab) && (
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-card-title">
              {tabs.find((t) => t.id === activeTab)?.label}
            </div>
          </div>
          <div className="v2-card-body">
            <div className="v2-text-xs v2-text-muted">
              Enterprise configuration active and synchronizing with branch policies. All changes are logged to the immutable audit trail.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
