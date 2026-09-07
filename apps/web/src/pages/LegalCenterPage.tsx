import React, { useState, useEffect } from "react";
import {
  Shield,
  FileText,
  CheckCircle2,
  Lock,
  Globe,
  Download,
  Printer,
  ChevronRight,
  ExternalLink,
  Layers,
  Search,
  ArrowLeft,
  Server,
  Code2,
  Cookie,
} from "lucide-react";
import { apiFetch } from "../services/apiClient.js";

interface LegalDocListItem {
  id: string;
  slug: string;
  documentType: string;
  title: string;
  version: string;
  isMandatory: boolean;
  description: string;
  cryptographicIntegrityHash: string;
  effectiveAt: string;
}

interface SubprocessorItem {
  id: string;
  provider: string;
  serviceName: string;
  purpose: string;
  dataCategories: string[];
  dataRegion: string;
  dpaStatus: string;
  privacyPolicyUrl: string;
  securityCertifications: string[];
}

interface OssNoticeItem {
  id: string;
  packageName: string;
  version: string;
  license: string;
  authorOrVendor: string;
  homepageUrl?: string;
  attributionNotice: string;
}

interface CookieManifest {
  statement: string;
  categories: Array<{
    name: string;
    description: string;
    essential: boolean;
    cookies: string[];
  }>;
  lastUpdated: string;
}

export const LegalCenterPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [activeTab, setActiveTab] = useState<"policies" | "subprocessors" | "oss" | "cookies">("policies");
  const [documents, setDocuments] = useState<LegalDocListItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("terms-of-service");
  const [activeDocDetail, setActiveDocDetail] = useState<{
    document: any;
    activeVersion: any;
    isTamperVerified: boolean;
  } | null>(null);
  const [subprocessors, setSubprocessors] = useState<SubprocessorItem[]>([]);
  const [ossNotices, setOssNotices] = useState<OssNoticeItem[]>([]);
  const [cookieManifest, setCookieManifest] = useState<CookieManifest | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Load document list based on selected language
  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch<{ success: boolean; data: LegalDocListItem[] }>(`/api/legal/documents?language=${language}`)
      .then((res) => {
        if (!alive) return;
        if (res.success && res.data) {
          setDocuments(res.data);
          if (!res.data.some((d) => d.slug === selectedSlug) && res.data.length > 0) {
            setSelectedSlug(res.data[0].slug);
          }
        }
      })
      .catch((err) => console.error("Failed to load legal documents", err))
      .finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [language]);

  // Load selected document detail
  useEffect(() => {
    if (!selectedSlug) return;
    let alive = true;
    apiFetch<{
      success: boolean;
      data: { document: any; activeVersion: any; isTamperVerified: boolean };
    }>(`/api/legal/documents/${encodeURIComponent(selectedSlug)}?language=${language}`)
      .then((res) => {
        if (alive && res.success && res.data) {
          setActiveDocDetail(res.data);
        }
      })
      .catch((err) => console.error("Failed to load document content", err));

    return () => { alive = false; };
  }, [selectedSlug, language]);

  // Load secondary tabs
  useEffect(() => {
    if (activeTab === "subprocessors" && subprocessors.length === 0) {
      apiFetch<{ success: boolean; data: SubprocessorItem[] }>("/api/legal/subprocessors")
        .then((res) => res.success && setSubprocessors(res.data))
        .catch(console.error);
    } else if (activeTab === "oss" && ossNotices.length === 0) {
      apiFetch<{ success: boolean; data: OssNoticeItem[] }>("/api/legal/oss-notices")
        .then((res) => res.success && setOssNotices(res.data))
        .catch(console.error);
    } else if (activeTab === "cookies" && !cookieManifest) {
      apiFetch<{ success: boolean; data: CookieManifest }>("/api/legal/cookies")
        .then((res) => res.success && setCookieManifest(res.data))
        .catch(console.error);
    }
  }, [activeTab]);

  const filteredDocs = documents.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.documentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="v2-page-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {onNavigate && (
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={() => onNavigate("/")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem" }}
            >
              <ArrowLeft size={16} /> Return to App
            </button>
          )}
          <div>
            <h1 className="v2-text-2xl v2-font-black" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Shield size={24} style={{ color: "var(--color-primary, #3b82f6)" }} />
              Legal, Compliance &amp; Licensing Center
            </h1>
            <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
              Official statutory legal contracts, privacy governance, and cryptographic compliance for KwakoPos v2.0.0
            </p>
          </div>
        </div>

        {/* Language Selector & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--surface-sunken, #f1f5f9)", padding: "0.25rem 0.5rem", borderRadius: "6px" }}>
            <Globe size={14} />
            <span className="v2-text-xs v2-font-bold">Language:</span>
            <button
              type="button"
              className={`v2-btn v2-btn-xs ${language === "en" ? "v2-btn-primary" : "v2-btn-ghost"}`}
              onClick={() => setLanguage("en")}
            >
              English
            </button>
            <button
              type="button"
              className={`v2-btn v2-btn-xs ${language === "sw" ? "v2-btn-primary" : "v2-btn-ghost"}`}
              onClick={() => setLanguage("sw")}
            >
              Kiswahili
            </button>
          </div>

          <button type="button" className="v2-btn v2-btn-secondary" onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Printer size={15} /> Print Policy
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--surface-border, #e2e8f0)", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("policies")}
          className={`v2-btn ${activeTab === "policies" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <FileText size={16} /> Legal Policies ({documents.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("subprocessors")}
          className={`v2-btn ${activeTab === "subprocessors" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Server size={16} /> Subprocessors &amp; Hosting
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("oss")}
          className={`v2-btn ${activeTab === "oss" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Code2 size={16} /> Open Source Licenses
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cookies")}
          className={`v2-btn ${activeTab === "cookies" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Cookie size={16} /> Cookie &amp; Storage Transparency
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === "policies" && (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.5rem" }}>
          {/* Document Sidebar Selector */}
          <div className="v2-card" style={{ padding: "1rem", maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", marginBottom: "1rem" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--text-muted, #94a3b8)" }} />
              <input
                type="text"
                className="v2-input"
                placeholder="Search legal documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "32px", fontSize: "0.85rem", width: "100%" }}
              />
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {filteredDocs.map((doc) => {
                const isSelected = doc.slug === selectedSlug;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedSlug(doc.slug)}
                    style={{
                      textAlign: "left",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "6px",
                      border: isSelected ? "1px solid var(--color-primary, #3b82f6)" : "1px solid transparent",
                      background: isSelected ? "var(--color-primary-sunken, #eff6ff)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.2rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="v2-text-sm v2-font-bold" style={{ color: isSelected ? "var(--color-primary, #1d4ed8)" : "inherit" }}>
                        {doc.title}
                      </span>
                      <span className="v2-badge v2-badge-sm v2-mono" style={{ fontSize: "0.7rem" }}>
                        v{doc.version}
                      </span>
                    </div>
                    <span className="v2-text-xs v2-text-muted" style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.description || doc.documentType}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reading Pane */}
          <div className="v2-card" style={{ padding: "2rem", minHeight: "80vh" }}>
            {activeDocDetail ? (
              <div>
                {/* Header Metadata Banner */}
                <div style={{ paddingBottom: "1.5rem", borderBottom: "1px solid var(--surface-border, #e2e8f0)", marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <span className="v2-badge v2-badge-secondary" style={{ marginBottom: "0.5rem" }}>
                        {activeDocDetail.document.documentType}
                      </span>
                      <h2 className="v2-text-3xl v2-font-black" style={{ margin: "0.25rem 0" }}>
                        {activeDocDetail.activeVersion.title}
                      </h2>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
                        <span className="v2-text-xs v2-text-muted">
                          <strong>Effective Date:</strong> {new Date(activeDocDetail.activeVersion.effectiveAt).toLocaleDateString()}
                        </span>
                        <span className="v2-text-xs v2-text-muted">
                          <strong>Version:</strong> {activeDocDetail.activeVersion.version}
                        </span>
                        <span className="v2-text-xs v2-text-muted">
                          <strong>Jurisdiction:</strong> United Republic of Tanzania &amp; East African Community
                        </span>
                      </div>
                    </div>

                    {/* Cryptographic SHA-256 Badge */}
                    <div
                      style={{
                        padding: "0.6rem 0.85rem",
                        borderRadius: "8px",
                        background: activeDocDetail.isTamperVerified ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        border: `1px solid ${activeDocDetail.isTamperVerified ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)"}`,
                        maxWidth: "360px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: activeDocDetail.isTamperVerified ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)" }}>
                        <CheckCircle2 size={16} />
                        <span className="v2-text-xs v2-font-bold">
                          {activeDocDetail.isTamperVerified ? "Cryptographically Verified (SHA-256)" : "Tamper Alert: Hash Mismatch"}
                        </span>
                      </div>
                      <div className="v2-mono v2-text-xs" style={{ wordBreak: "break-all", fontSize: "0.7rem", marginTop: "0.25rem", color: "var(--text-muted, #64748b)" }}>
                        {activeDocDetail.activeVersion.cryptographicIntegrityHash}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body Content */}
                <article
                  style={{
                    lineHeight: "1.7",
                    fontSize: "0.95rem",
                    whiteSpace: "pre-wrap",
                    color: "var(--text-color, #1e293b)",
                  }}
                >
                  {activeDocDetail.activeVersion.content}
                </article>

                {/* Footer Statutory Declaration */}
                <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid var(--surface-border, #e2e8f0)" }}>
                  <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
                    This official document is governed by the laws of the United Republic of Tanzania (including the Personal Data Protection Act No. 5 of 2022 and Tanzania Tax Administration statutory provisions).
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", placeItems: "center", minHeight: "400px" }}>
                <span className="v2-text-muted">Loading policy details...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subprocessors Tab */}
      {activeTab === "subprocessors" && (
        <div className="v2-card" style={{ padding: "1.5rem" }}>
          <h2 className="v2-text-xl v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Authorized Subprocessors &amp; Third-Party Services
          </h2>
          <p className="v2-text-sm v2-text-muted" style={{ marginBottom: "1.5rem" }}>
            In accordance with the Tanzania Personal Data Protection Act 2022 and international privacy standards, the following third-party infrastructure providers are engaged to deliver KwakoPos cloud synchronization, messaging, and database services:
          </p>

          <table className="v2-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--surface-border, #e2e8f0)" }}>
                <th style={{ padding: "0.75rem" }}>Provider &amp; Service</th>
                <th style={{ padding: "0.75rem" }}>Processing Purpose</th>
                <th style={{ padding: "0.75rem" }}>Data Region</th>
                <th style={{ padding: "0.75rem" }}>Data Categories</th>
                <th style={{ padding: "0.75rem" }}>Security Standards</th>
                <th style={{ padding: "0.75rem" }}>DPA Status</th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map((sub) => (
                <tr key={sub.id} style={{ borderBottom: "1px solid var(--surface-border, #e2e8f0)" }}>
                  <td style={{ padding: "0.75rem" }}>
                    <strong>{sub.provider}</strong>
                    <div className="v2-text-xs v2-text-muted">{sub.serviceName}</div>
                  </td>
                  <td style={{ padding: "0.75rem" }}>{sub.purpose}</td>
                  <td style={{ padding: "0.75rem" }}>
                    <span className="v2-badge v2-badge-secondary">{sub.dataRegion}</span>
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                      {sub.dataCategories.map((c) => (
                        <span key={c} className="v2-badge v2-badge-sm">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                      {sub.securityCertifications.map((cert) => (
                        <span key={cert} className="v2-badge v2-badge-sm v2-badge-accent">{cert}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    <span className="v2-badge v2-badge-success">{sub.dpaStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* OSS Licenses Tab */}
      {activeTab === "oss" && (
        <div className="v2-card" style={{ padding: "1.5rem" }}>
          <h2 className="v2-text-xl v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Open Source Software (OSS) Licenses &amp; Attribution
          </h2>
          <p className="v2-text-sm v2-text-muted" style={{ marginBottom: "1.5rem" }}>
            KwakoPos v2.0.0 proudly incorporates open-source components under compliant licenses (MIT, Apache-2.0, BSD). Full legal attribution notices are provided below:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
            {ossNotices.map((oss) => (
              <div key={oss.id} className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="v2-text-base v2-font-bold" style={{ margin: 0 }}>{oss.packageName}</h3>
                  <span className="v2-badge v2-badge-secondary">{oss.license}</span>
                </div>
                <div className="v2-text-xs v2-text-muted" style={{ margin: "0.25rem 0 0.5rem" }}>
                  v{oss.version} • {oss.authorOrVendor}
                </div>
                <p className="v2-text-xs" style={{ background: "var(--surface-sunken, #f8fafc)", padding: "0.5rem", borderRadius: "4px", margin: 0 }}>
                  {oss.attributionNotice}
                </p>
                {oss.homepageUrl && (
                  <a
                    href={oss.homepageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="v2-text-xs"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.5rem", color: "var(--color-primary, #3b82f6)" }}
                  >
                    View Project Repository <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cookies Tab */}
      {activeTab === "cookies" && (
        <div className="v2-card" style={{ padding: "1.5rem" }}>
          <h2 className="v2-text-xl v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Cookie &amp; Local Storage Transparency Manifest
          </h2>
          {cookieManifest && (
            <div>
              <p className="v2-text-sm v2-text-muted" style={{ marginBottom: "1.5rem" }}>
                {cookieManifest.statement}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {cookieManifest.categories.map((cat) => (
                  <div key={cat.name} className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 className="v2-text-base v2-font-bold" style={{ margin: 0 }}>{cat.name}</h3>
                      <span className={`v2-badge ${cat.essential ? "v2-badge-primary" : "v2-badge-secondary"}`}>
                        {cat.essential ? "Essential / Always Active" : "Optional"}
                      </span>
                    </div>
                    <p className="v2-text-xs v2-text-muted" style={{ margin: "0.5rem 0" }}>
                      {cat.description}
                    </p>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {cat.cookies.length > 0 ? (
                        cat.cookies.map((c) => (
                          <span key={c} className="v2-mono v2-badge v2-badge-sm">{c}</span>
                        ))
                      ) : (
                        <span className="v2-text-xs v2-text-muted">None used</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
