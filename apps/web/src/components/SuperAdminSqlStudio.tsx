/**
 * KwakoPosv2 — Super Admin SQL Studio & Live Database Control Room
 * ─────────────────────────────────────────────────────────────────
 * Embedded database explorer, query runner with safety guards,
 * table schema inspector, system vitals, and maintenance suite.
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Database,
  Terminal,
  Play,
  RefreshCw,
  Download,
  Copy,
  Check,
  AlertTriangle,
  Shield,
  Clock,
  Layers,
  Search,
  HardDrive,
  Zap,
  Activity,
  Server,
  FileCode,
  Wrench,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { apiFetch } from "../services/applicationApiService.js";

type SubTab = "sql-studio" | "db-explorer" | "vitals" | "maintenance" | "logs";

interface QueryResult {
  success: boolean;
  command?: string;
  rowCount?: number;
  fields?: { name: string; dataTypeID?: number }[];
  rows?: any[];
  durationMs?: number;
  error?: string;
}

interface TableSummary {
  name: string;
  estimatedRows: number;
  totalSize: string;
  columnCount: number;
  columns: {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default?: string | null;
  }[];
}

interface SystemMetrics {
  success: boolean;
  process: {
    uptimeSeconds: number;
    pid: number;
    nodeVersion: string;
    platform: string;
    memory: {
      rssFormatted: string;
      heapUsedFormatted: string;
      heapTotalFormatted: string;
      heapUsagePercent: number;
    };
  };
  database: {
    name: string;
    sizeFormatted: string;
    activeBackends: number;
    cacheHitRate: string;
    commits: number;
    rollbacks: number;
  };
  counts: {
    tenants: number;
    users: number;
    products: number;
    orders: number;
  };
}

interface SystemLog {
  id: string;
  timestamp: number;
  level: string;
  message: string;
}

const PRESET_QUERIES = [
  {
    name: "📊 Active Tenants Summary",
    query: `SELECT id, name, plan, status, business_code, created_at FROM tenants WHERE deleted_at IS NULL ORDER BY name ASC;`,
  },
  {
    name: "💾 Database Table Sizes & Rows",
    query: `SELECT 
  relname as table_name, 
  n_live_tup as row_count, 
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(relid) DESC;`,
  },
  {
    name: "🏷️ Taxonomy: Products by Category",
    query: `SELECT 
  COALESCE(category, 'Unassigned') as category_name,
  count(id) as product_count,
  sum(stock) as total_stock
FROM products
WHERE is_deleted = false
GROUP BY category
ORDER BY product_count DESC;`,
  },
  {
    name: "🔗 Foreign Key Integrity Inspection",
    query: `SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;`,
  },
  {
    name: "⚡ Sync Queue Health & Dead-Letter Items",
    query: `SELECT tenant_id, count(*) as total_records, max(created_at) as latest_record_time FROM stock_ledger GROUP BY tenant_id;`,
  },
  {
    name: "🔒 Active Client Connections & Locks",
    query: `SELECT pid, usename, datname, client_addr, state, query_start FROM pg_stat_activity WHERE pid <> pg_backend_pid();`,
  },
];

export const SuperAdminSqlStudio: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("sql-studio");

  // ── SQL Studio State ──
  const [sqlQuery, setSqlQuery] = useState<string>(PRESET_QUERIES[0].query);
  const [readOnly, setReadOnly] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [queryFilter, setQueryFilter] = useState<string>("");

  // ── Database Explorer State ──
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loadingTables, setLoadingTables] = useState<boolean>(false);
  const [selectedTableName, setSelectedTableName] = useState<string>("products");
  const [explorerTab, setExplorerTab] = useState<"data" | "schema">("data");
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableFields, setTableFields] = useState<string[]>([]);
  const [tableTotalCount, setTableTotalCount] = useState<number>(0);
  const [tablePage, setTablePage] = useState<number>(0);
  const [tableSearch, setTableSearch] = useState<string>("");
  const [loadingTableData, setLoadingTableData] = useState<boolean>(false);

  // ── System Vitals State ──
  const [vitals, setVitals] = useState<SystemMetrics | null>(null);
  const [loadingVitals, setLoadingVitals] = useState<boolean>(false);

  // ── Maintenance State ──
  const [maintenanceRunning, setMaintenanceRunning] = useState<string | null>(null);
  const [maintenanceReports, setMaintenanceReports] = useState<any[]>([]);

  // ── Logs State ──
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logLevel, setLogLevel] = useState<string>("ALL");
  const [logSearch, setLogSearch] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // ── Load Tables ──
  const fetchTables = async () => {
    setLoadingTables(true);
    try {
      const res = await apiFetch<{ success: boolean; tables?: TableSummary[] }>("/api/v1/super-admin/db/tables");
      if (res && res.success && res.tables) {
        setTables(res.tables);
        if (res.tables.length > 0 && !res.tables.some((t) => t.name === selectedTableName)) {
          setSelectedTableName(res.tables[0].name);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingTables(false);
    }
  };

  // ── Load Table Data ──
  const fetchTableData = async () => {
    setLoadingTableData(true);
    try {
      const params = new URLSearchParams({
        table: selectedTableName,
        limit: "50",
        offset: String(tablePage * 50),
        ...(tableSearch ? { search: tableSearch } : {}),
      });
      const res = await apiFetch<{
        success: boolean;
        totalCount?: number;
        rows?: any[];
        fields?: string[];
      }>(`/api/v1/super-admin/db/table-data?${params.toString()}`);
      if (res && res.success) {
        setTableData(res.rows || []);
        setTableFields(res.fields || []);
        setTableTotalCount(res.totalCount || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTableData(false);
    }
  };

  // ── Load Vitals ──
  const fetchVitals = async () => {
    setLoadingVitals(true);
    try {
      const res = await apiFetch<SystemMetrics>("/api/v1/super-admin/system/metrics");
      if (res && res.success) {
        setVitals(res);
      }
    } catch {
      // ignore
    } finally {
      setLoadingVitals(false);
    }
  };

  // ── Load Logs ──
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await apiFetch<{ success: boolean; logs?: SystemLog[] }>(
        `/api/v1/super-admin/system/logs?level=${logLevel}`
      );
      if (res && res.success && res.logs) {
        setLogs(res.logs);
      }
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "db-explorer") {
      fetchTables();
    } else if (activeSubTab === "vitals") {
      fetchVitals();
    } else if (activeSubTab === "logs") {
      fetchLogs();
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab === "db-explorer" && selectedTableName) {
      fetchTableData();
    }
  }, [selectedTableName, tablePage, tableSearch, activeSubTab]);

  // ── Execute SQL Query ──
  const handleExecuteQuery = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecuting(true);
    setQueryResult({
      success: false,
      error: "Direct SQL execution is disabled by the production control-plane policy.",
    });
    setIsExecuting(false);
  };

  // ── Run Maintenance ──
  const handleRunMaintenance = async (action: string) => {
    setMaintenanceRunning(action);
    try {
      const res = await apiFetch<{ success: boolean; report?: any }>("/api/v1/super-admin/db/maintenance", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (res && res.success && res.report) {
        setMaintenanceReports((prev) => [res.report, ...prev]);
      }
    } catch {
      // ignore
    } finally {
      setMaintenanceRunning(null);
    }
  };

  // ── Export Results ──
  const handleExportCsv = () => {
    if (!queryResult?.rows || queryResult.rows.length === 0) return;
    const headers = Object.keys(queryResult.rows[0]);
    const csvContent = [
      headers.join(","),
      ...queryResult.rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `kwakopos_sql_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyJson = () => {
    if (!queryResult?.rows) return;
    navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredQueryRows = useMemo(() => {
    if (!queryResult?.rows) return [];
    if (!queryFilter.trim()) return queryResult.rows;
    const q = queryFilter.toLowerCase();
    return queryResult.rows.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [queryResult?.rows, queryFilter]);

  const selectedTableMeta = useMemo(() => {
    return tables.find((t) => t.name === selectedTableName);
  }, [tables, selectedTableName]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Sub-navigation bar */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
        <button
          className={`btn ${activeSubTab === "sql-studio" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("sql-studio")}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
        >
          <Terminal size={14} /> SQL Studio
        </button>
        <button
          className={`btn ${activeSubTab === "db-explorer" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("db-explorer")}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
        >
          <Database size={14} /> Database Explorer
        </button>
        <button
          className={`btn ${activeSubTab === "vitals" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("vitals")}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
        >
          <Activity size={14} /> System Vitals
        </button>
        <button
          className={`btn ${activeSubTab === "maintenance" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("maintenance")}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
        >
          <Wrench size={14} /> Maintenance
        </button>
        <button
          className={`btn ${activeSubTab === "logs" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("logs")}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
        >
          <FileCode size={14} /> Platform Logs
        </button>
      </div>

      {/* ── SUB-TAB 1: SQL STUDIO ── */}
      {activeSubTab === "sql-studio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Query controls card */}
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>Preset Queries:</span>
                <select
                  className="input"
                  style={{ fontSize: "0.85rem", padding: "0.3rem 0.6rem" }}
                  onChange={(e) => {
                    const found = PRESET_QUERIES.find((p) => p.name === e.target.value);
                    if (found) setSqlQuery(found.query);
                  }}
                  defaultValue={PRESET_QUERIES[0].name}
                >
                  {PRESET_QUERIES.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(e) => setReadOnly(e.target.checked)}
                  />
                  <Shield size={14} color={readOnly ? "var(--color-success, #10b981)" : "var(--color-warning, #f59e0b)"} />
                  <span>Read-Only Guard</span>
                </label>
                <button
                  className="btn btn-primary"
                  onClick={handleExecuteQuery}
                  disabled={isExecuting || !sqlQuery.trim()}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.45rem 1rem", fontWeight: 600 }}
                >
                  {isExecuting ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                  <span>{isExecuting ? "Executing..." : "Run Query"}</span>
                </button>
              </div>
            </div>

            {/* SQL Editor Area */}
            <div style={{ position: "relative" }}>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleExecuteQuery();
                  }
                }}
                rows={6}
                style={{
                  width: "100%",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "0.88rem",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "rgba(0,0,0,0.25)",
                  color: "var(--text-primary)",
                  resize: "vertical",
                }}
                placeholder="Write SQL query here... (Press Ctrl+Enter to execute)"
              />
              <span
                style={{
                  position: "absolute",
                  bottom: "10px",
                  right: "12px",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  pointerEvents: "none",
                }}
              >
                Press Ctrl + Enter to run
              </span>
            </div>
          </div>

          {/* Query Results */}
          {queryResult && (
            <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Results</span>
                  {queryResult.success ? (
                    <>
                      <span className="badge badge-success" style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <CheckCircle2 size={12} /> {queryResult.rowCount ?? 0} rows
                      </span>
                      {queryResult.durationMs !== undefined && (
                        <span className="badge badge-secondary" style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <Clock size={12} /> {queryResult.durationMs} ms
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="badge badge-danger" style={{ fontSize: "0.75rem" }}>
                      Error
                    </span>
                  )}
                </div>

                {queryResult.success && queryResult.rows && queryResult.rows.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "0.2rem 0.5rem" }}>
                      <Search size={12} color="var(--text-secondary)" />
                      <input
                        type="text"
                        placeholder="Filter rows..."
                        value={queryFilter}
                        onChange={(e) => setQueryFilter(e.target.value)}
                        style={{ border: "none", background: "transparent", fontSize: "0.8rem", color: "var(--text-primary)", outline: "none", width: "120px" }}
                      />
                    </div>
                    <button className="btn btn-secondary" onClick={handleExportCsv} style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}>
                      <Download size={12} /> CSV
                    </button>
                    <button className="btn btn-secondary" onClick={handleCopyJson} style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}>
                      {copied ? <Check size={12} color="var(--color-success)" /> : <Copy size={12} />} JSON
                    </button>
                  </div>
                )}
              </div>

              {!queryResult.success ? (
                <div style={{ padding: "0.85rem", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "var(--color-danger, #ef4444)", fontSize: "0.85rem", fontFamily: "monospace" }}>
                  <AlertTriangle size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.4rem" }} />
                  {queryResult.error}
                </div>
              ) : filteredQueryRows.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  No matching rows returned.
                </div>
              ) : (
                <div style={{ overflowX: "auto", maxHeight: "400px", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                    <thead>
                      <tr style={{ backgroundColor: "rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid var(--border-color)" }}>
                        {Object.keys(filteredQueryRows[0]).map((h) => (
                          <th key={h} style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQueryRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          style={{
                            borderBottom: "1px solid var(--border-color)",
                            backgroundColor: rIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                          }}
                        >
                          {Object.keys(filteredQueryRows[0]).map((h, cIdx) => (
                            <td key={cIdx} style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap", fontFamily: typeof row[h] === "number" ? "monospace" : "inherit" }}>
                              {row[h] === null ? (
                                <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>null</span>
                              ) : typeof row[h] === "boolean" ? (
                                row[h] ? "true" : "false"
                              ) : typeof row[h] === "object" ? (
                                JSON.stringify(row[h])
                              ) : (
                                String(row[h])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SUB-TAB 2: DATABASE EXPLORER ── */}
      {activeSubTab === "db-explorer" && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "1rem" }}>
          {/* Tables list */}
          <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "600px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Tables ({tables.length})</span>
              <button className="btn btn-secondary" onClick={fetchTables} disabled={loadingTables} style={{ padding: "0.2rem 0.4rem" }}>
                <RefreshCw size={12} className={loadingTables ? "spin" : ""} />
              </button>
            </div>
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  setSelectedTableName(t.name);
                  setTablePage(0);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "4px",
                  border: "none",
                  textAlign: "left",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  backgroundColor: selectedTableName === t.name ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: selectedTableName === t.name ? "var(--color-primary, #3b82f6)" : "var(--text-primary)",
                  fontWeight: selectedTableName === t.name ? 600 : 400,
                }}
              >
                <span>{t.name}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{t.estimatedRows}</span>
              </button>
            ))}
          </div>

          {/* Table Data / Schema View */}
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>{selectedTableName}</span>
                {selectedTableMeta && (
                  <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
                    {selectedTableMeta.totalSize} • ~{selectedTableMeta.estimatedRows} rows
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className={`btn ${explorerTab === "data" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setExplorerTab("data")}
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
                >
                  Records Data
                </button>
                <button
                  className={`btn ${explorerTab === "schema" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setExplorerTab("schema")}
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
                >
                  Schema Columns
                </button>
              </div>
            </div>

            {explorerTab === "data" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search table rows..."
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setTablePage(0);
                    }}
                    style={{ fontSize: "0.82rem", maxWidth: "250px", padding: "0.3rem 0.6rem" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
                    <span>
                      Page {tablePage + 1} of {Math.max(1, Math.ceil(tableTotalCount / 50))}
                    </span>
                    <button
                      className="btn btn-secondary"
                      disabled={tablePage === 0}
                      onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                      style={{ padding: "0.2rem 0.5rem" }}
                    >
                      Prev
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={(tablePage + 1) * 50 >= tableTotalCount}
                      onClick={() => setTablePage((p) => p + 1)}
                      style={{ padding: "0.2rem 0.5rem" }}
                    >
                      Next
                    </button>
                  </div>
                </div>

                {loadingTableData ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                    <RefreshCw size={18} className="spin" /> Loading data...
                  </div>
                ) : tableData.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                    No records found in {selectedTableName}.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", maxHeight: "450px", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                      <thead>
                        <tr style={{ backgroundColor: "rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid var(--border-color)" }}>
                          {tableFields.map((f) => (
                            <th key={f} style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                              {f}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            {tableFields.map((f) => (
                              <td key={f} style={{ padding: "0.45rem 0.75rem", whiteSpace: "nowrap" }}>
                                {row[f] === null ? <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>null</span> : String(row[f])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              /* Schema viewer */
              <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--border-color)" }}>
                      <th style={{ padding: "0.5rem 0.75rem" }}>Column Name</th>
                      <th style={{ padding: "0.5rem 0.75rem" }}>Data Type</th>
                      <th style={{ padding: "0.5rem 0.75rem" }}>Nullable</th>
                      <th style={{ padding: "0.5rem 0.75rem" }}>Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTableMeta?.columns.map((c) => (
                      <tr key={c.column_name} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>{c.column_name}</td>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", color: "var(--color-primary, #3b82f6)" }}>
                          {c.data_type}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{c.is_nullable}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)" }}>{c.column_default || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUB-TAB 3: SYSTEM VITALS ── */}
      {activeSubTab === "vitals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {vitals && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  <HardDrive size={16} /> Memory (RSS / Heap)
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{vitals.process.memory.heapUsedFormatted}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  Heap Total: {vitals.process.memory.heapTotalFormatted} ({vitals.process.memory.heapUsagePercent}%)
                </div>
              </div>

              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  <Database size={16} /> PostgreSQL Size
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{vitals.database.sizeFormatted}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  Active Pool Backends: {vitals.database.activeBackends} • Cache Hit: {vitals.database.cacheHitRate}
                </div>
              </div>

              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  <Server size={16} /> Runtime & Uptime
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                  {Math.floor(vitals.process.uptimeSeconds / 3600)}h {Math.floor((vitals.process.uptimeSeconds % 3600) / 60)}m
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  Node {vitals.process.nodeVersion} • PID: {vitals.process.pid}
                </div>
              </div>

              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  <Layers size={16} /> Platform Entities
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{vitals.counts.tenants} Tenants</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  {vitals.counts.products} Products • {vitals.counts.orders} Orders
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUB-TAB 4: MAINTENANCE ── */}
      {activeSubTab === "maintenance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Database Maintenance & Integrity Automation</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Safely trigger vacuuming, index rebuilding, and foreign key verification across all tenant partitions.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
              <div style={{ padding: "1rem", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>VACUUM & ANALYZE</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Reclaims dead tuple space and updates query planner statistics.</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRunMaintenance("VACUUM")}
                  disabled={Boolean(maintenanceRunning)}
                  style={{ marginTop: "auto", fontSize: "0.8rem" }}
                >
                  {maintenanceRunning === "VACUUM" ? <RefreshCw size={12} className="spin" /> : <Play size={12} />} Run Vacuum
                </button>
              </div>

              <div style={{ padding: "1rem", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>REINDEX B-TREES</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Reconstructs corrupted or fragmented index pages to restore low-latency queries.</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRunMaintenance("REINDEX")}
                  disabled={Boolean(maintenanceRunning)}
                  style={{ marginTop: "auto", fontSize: "0.8rem" }}
                >
                  {maintenanceRunning === "REINDEX" ? <RefreshCw size={12} className="spin" /> : <Play size={12} />} Run Reindex
                </button>
              </div>

              <div style={{ padding: "1rem", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>AUDIT INTEGRITY</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Verifies tenant boundary isolation and foreign key referential integrity.</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRunMaintenance("AUDIT_INTEGRITY")}
                  disabled={Boolean(maintenanceRunning)}
                  style={{ marginTop: "auto", fontSize: "0.8rem" }}
                >
                  {maintenanceRunning === "AUDIT_INTEGRITY" ? <RefreshCw size={12} className="spin" /> : <Play size={12} />} Run Audit
                </button>
              </div>

              <div style={{ padding: "1rem", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>PURGE ORPHANS</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Safely reclaims orphaned product variants or disconnected sync records.</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRunMaintenance("PURGE_ORPHANS")}
                  disabled={Boolean(maintenanceRunning)}
                  style={{ marginTop: "auto", fontSize: "0.8rem" }}
                >
                  {maintenanceRunning === "PURGE_ORPHANS" ? <RefreshCw size={12} className="spin" /> : <Trash2 size={12} />} Purge Orphans
                </button>
              </div>
            </div>

            {/* Maintenance execution reports */}
            {maintenanceReports.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem", display: "block" }}>Execution Reports</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {maintenanceReports.map((r, idx) => (
                    <div key={idx} style={{ padding: "0.75rem", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "6px", fontSize: "0.82rem" }}>
                      <span style={{ fontWeight: 600 }}>{r.action}</span>: Status <strong>{r.status}</strong> in {r.durationMs}ms. Healthy: {r.healthy ? "YES" : "NO"}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUB-TAB 5: PLATFORM LOGS ── */}
      {activeSubTab === "logs" && (
        <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Log Level:</span>
              <select
                className="input"
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                style={{ fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
              >
                <option value="ALL">ALL LEVELS</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
                <option value="SECURITY">SECURITY</option>
                <option value="SYNC">SYNC</option>
                <option value="SQL">SQL</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="text"
                className="input"
                placeholder="Search log messages..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{ fontSize: "0.82rem", padding: "0.25rem 0.5rem", width: "200px" }}
              >
              </input>
              <button className="btn btn-secondary" onClick={fetchLogs} disabled={loadingLogs} style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>
                <RefreshCw size={12} className={loadingLogs ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "450px", overflowY: "auto", fontFamily: "monospace", fontSize: "0.8rem" }}>
            {logs
              .filter((l) => !logSearch || l.message.toLowerCase().includes(logSearch.toLowerCase()))
              .map((l) => (
                <div
                  key={l.id}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                    {new Date(l.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`badge ${
                      l.level === "ERROR"
                        ? "badge-danger"
                        : l.level === "WARN"
                        ? "badge-warning"
                        : l.level === "SECURITY"
                        ? "badge-danger"
                        : "badge-secondary"
                    }`}
                    style={{ fontSize: "0.7rem" }}
                  >
                    {l.level}
                  </span>
                  <span>{l.message}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
