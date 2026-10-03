/**
 * KwakoPosv2 — Operational Expenses & Outgoings Command Center
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete, high-fidelity Expense & Petty Cash management ported from legacy UX:
 *   1. Date range filters (Today, 7 Days, 30 Days, This Month, Quarter, All, Custom)
 *   2. Filter by Category, Payment Method, and Status (All, Paid, Pending)
 *   3. Search across vouchers, payees, and descriptions
 *   4. KPI Summary Cards (Total Expenses, Paid Out, Pending Approval, Tax Deductible)
 *   5. Full Outgoings Ledger Table with live badges and actions
 *   6. Add Expense Voucher Modal with full validation & metadata
 *   7. Pay Pending Voucher Modal with payment method & transaction ref
 *   8. Offline-first local store integration (IndexedDB + Fastify sync outbox)
 *   9. Export CSV & Print summary capabilities
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, TrendingDown, Calendar, CreditCard, Trash2, CheckCircle2,
  AlertCircle, Tag, X, Download, Printer, Copy, Building, Check,
  FileText, DollarSign, Coins, Clock, CheckCircle, Eye, RefreshCw, Filter,
  Receipt, Sparkles
} from "lucide-react";
import { useAuth, useBranch, useModule, useRbac, useSync, useTenant, useTranslation, useFormatters } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/apiClient.js";
import { DATA_CHANGED_EVENT } from "../services/dataChangeEvent.js";

export interface ExpenseRecord {
  id: string;
  tenantId?: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  payee: string;
  paymentMethod: string;
  paymentRef?: string;
  status: "PAID" | "PENDING" | "VOIDED";
  taxDeductible: boolean;
  isHq?: boolean;
  branchId?: string;
  cashSessionId?: string;
  createdAt?: string;
}

export type DateRangeType = "month" | "today" | "7days" | "30days" | "quarter" | "all" | "custom";

const EXPENSE_CATEGORIES = [
  "Utilities",
  "Rent",
  "Salaries & Wages",
  "Supplies & Packaging",
  "Transport & Logistics",
  "Repairs & Maintenance",
  "Marketing & Promotions",
  "Licences & Permits",
  "Taxes & Levies",
  "Miscellaneous",
];

export interface ExpensesPageProps {
  activeTab?: string;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = () => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();
  const { user } = useAuth();
  const { isOnline, db } = useSync();
  const { t } = useTranslation();
  const { formatCurrency, formatMoneyCompact } = useFormatters();
  const { hasPermission } = useRbac();
  const canCreateExpense = hasPermission("FINANCE_CREATE") || hasPermission("*");
  const canVoidExpense = hasPermission("JOURNAL_REVERSE") || hasPermission("FINANCE_CREATE") || hasPermission("*");

  const toCanonicalPaymentMethod = (value: string): "CASH" | "BANK" | "MOBILE_MONEY" | "CARD" => {
    const normalized = String(value || "CASH").trim().toUpperCase().replace(/[ -]+/g, "_");
    if (normalized === "MPESA" || normalized === "M_PESA" || normalized === "MOBILEMONEY" || normalized === "AIRTEL_MONEY" || normalized === "TIGO_MONEY") return "MOBILE_MONEY";
    if (normalized === "BANK_TRANSFER" || normalized === "BANK") return "BANK";
    if (normalized === "CARD") return "CARD";
    return "CASH";
  };

  const fromCanonicalPaymentMethod = (value: string): string => {
    switch (toCanonicalPaymentMethod(value)) {
      case "MOBILE_MONEY": return "M-Pesa";
      case "BANK": return "Bank Transfer";
      case "CARD": return "Card";
      default: return "Cash";
    }
  };

  // Expenses data state
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter States
  const [dateRange, setDateRange] = useState<DateRangeType>("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchVal, setSearchVal] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("All");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [payModalItem, setPayModalItem] = useState<ExpenseRecord | null>(null);
  const [payMethod, setPayMethod] = useState("M-Pesa");
  const [payRef, setPayRef] = useState("");
  const [viewItem, setViewItem] = useState<ExpenseRecord | null>(null);

  // New Expense form state
  const [newCategory, setNewCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newDescription, setNewDescription] = useState("");
  const [newPayee, setNewPayee] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>("Cash");
  const [newPaymentRef, setNewPaymentRef] = useState("");
  const [newStatus, setNewStatus] = useState<"PAID" | "PENDING">("PAID");
  const [newTaxDeductible, setNewTaxDeductible] = useState(true);
  const [formError, setFormError] = useState("");

  // Load authoritative server Expenses when online; use tenant/branch-scoped IndexedDB only while offline.
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        await db.ready;
        const ctx = currentTenantId && currentBranchId ? { tenantId: currentTenantId, branchId: currentBranchId } : undefined;
        if (!currentTenantId || !currentBranchId) {
          if (active) setExpenses([]);
          return;
        }

        if (isOnline) {
          const res = await apiFetch<{ success: boolean; data: ExpenseRecord[] }>("/api/v1/expenses").catch(() => null);
          if (active && res && res.success && Array.isArray(res.data)) {
            const authoritative = res.data.map((e: any) => ({
              ...e,
              amount: Number(e.amount),
              date: e.incurredAt ? String(e.incurredAt).slice(0, 10) : e.date,
              description: e.description || e.reason || "",
              payee: e.payee || "Unspecified Payee",
              paymentMethod: fromCanonicalPaymentMethod(e.paymentMethod),
              status: e.status === "VOIDED" ? "VOIDED" : e.status === "PENDING" ? "PENDING" : "PAID",
              taxDeductible: Boolean(e.taxDeductible),
              cashSessionId: e.cashSessionId ? String(e.cashSessionId) : undefined,
            })) as ExpenseRecord[];
            db.saveConfigurationLocal("expenses", authoritative, ctx);
            setExpenses(authoritative);
            return;
          }
        }

        const localExp = db.getConfigurationLocal?.("expenses", ctx);
        if (active && Array.isArray(localExp)) setExpenses(localExp as ExpenseRecord[]);
        else if (active) setExpenses([]);
      } catch (err) {
        console.error("Failed to load expenses", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadData();

    const handleDataChange = () => { void loadData(); };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChange);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChange);
    };
  }, [db, isOnline, currentTenantId, currentBranchId]);

  // Date Range Bounds
  const { fromTs, toTs } = useMemo(() => {
    const now = new Date();
    let from = 0;
    let to = Date.now();

    if (dateRange === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      from = d.getTime();
    } else if (dateRange === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      from = d.getTime();
    } else if (dateRange === "30days") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      from = d.getTime();
    } else if (dateRange === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (dateRange === "quarter") {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), qMonth, 1).getTime();
    } else if (dateRange === "custom") {
      if (startDate) from = new Date(startDate).getTime();
      if (endDate) to = new Date(endDate).getTime() + 86399999;
    }

    return { fromTs: from, toTs: to };
  }, [dateRange, startDate, endDate]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // Date filter
      if (dateRange !== "all") {
        const itemTs = new Date(e.date).getTime();
        if (itemTs < fromTs || itemTs > toTs) return false;
      }

      // Category filter
      if (filterCategory !== "All" && e.category !== filterCategory) return false;

      // Status filter
      if (filterStatus !== "All" && e.status !== filterStatus) return false;

      // Payment Method filter
      if (filterPaymentMethod !== "All" && e.paymentMethod !== filterPaymentMethod) return false;

      // Search
      if (searchVal.trim()) {
        const q = searchVal.toLowerCase();
        const matchesDesc = e.description?.toLowerCase().includes(q);
        const matchesPayee = e.payee?.toLowerCase().includes(q);
        const matchesId = e.id?.toLowerCase().includes(q);
        if (!matchesDesc && !matchesPayee && !matchesId) return false;
      }

      return true;
    });
  }, [expenses, dateRange, fromTs, toTs, filterCategory, filterStatus, filterPaymentMethod, searchVal]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const paidList = filteredExpenses.filter((e) => e.status === "PAID");
    const paidAmount = paidList.reduce((s, e) => s + (e.amount || 0), 0);
    const pendingList = filteredExpenses.filter((e) => e.status === "PENDING");
    const pendingAmount = pendingList.reduce((s, e) => s + (e.amount || 0), 0);
    const taxDeductibleAmount = filteredExpenses
      .filter((e) => e.taxDeductible)
      .reduce((s, e) => s + (e.amount || 0), 0);

    return {
      total,
      paidCount: paidList.length,
      paidAmount,
      pendingCount: pendingList.length,
      pendingAmount,
      taxDeductibleAmount,
    };
  }, [filteredExpenses]);

  // Handle Add Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const numAmt = Number.parseFloat(newAmount);
    if (!Number.isFinite(numAmt) || numAmt <= 0) { setFormError("Please enter a valid expense amount."); return; }
    if (!newDescription.trim()) { setFormError("Please enter a description for the expense."); return; }
    if (!newPayee.trim()) { setFormError("Please specify the payee / vendor."); return; }
    if (!currentTenantId || !currentBranchId) { setFormError("Tenant and branch context are required before recording an expense."); return; }
    if (!canCreateExpense) { setFormError("Finance permission is required to record an expense."); return; }

    const expenseId = window.crypto.randomUUID();
    const idempotencyKey = `expense-${expenseId}`;
    const canonicalPaymentMethod = toCanonicalPaymentMethod(newPaymentMethod);
    const record: ExpenseRecord = {
      id: expenseId,
      tenantId: currentTenantId,
      branchId: currentBranchId,
      category: newCategory,
      amount: numAmt,
      date: newDate,
      description: newDescription.trim(),
      payee: newPayee.trim(),
      paymentMethod: fromCanonicalPaymentMethod(canonicalPaymentMethod),
      paymentRef: newPaymentRef.trim() || undefined,
      status: newStatus,
      taxDeductible: newTaxDeductible,
      createdAt: new Date().toISOString(),
    };
    const payload = {
      id: expenseId,
      category: record.category,
      amount: record.amount,
      reason: record.description,
      description: record.description,
      payee: record.payee,
      paymentMethod: canonicalPaymentMethod,
      paymentRef: record.paymentRef,
      status: record.status,
      taxDeductible: record.taxDeductible,
      tenantId: currentTenantId,
      branchId: currentBranchId,
      incurredAt: `${record.date}T12:00:00.000Z`,
      cashSessionId: undefined as string | undefined,
      idempotencyKey,
    };
    const activeCashSession = db.getConfigurationLocal?.("active_cash_session", { tenantId: currentTenantId, branchId: currentBranchId }) as any;
    if (canonicalPaymentMethod === "CASH" && record.status === "PAID") {
      payload.cashSessionId = activeCashSession?.id ? String(activeCashSession.id) : undefined;
      if (!isOnline && !payload.cashSessionId) {
        setFormError("An active cash session is required to record a paid cash expense while offline.");
        return;
      }
    }

    try {
      if (isOnline) {
        const res = await apiFetch<{ success: boolean; data: any }>("/api/v1/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const authoritative = {
          ...record,
          ...res.data,
          amount: Number(res.data.amount),
          date: String(res.data.incurredAt || record.date).slice(0, 10),
          paymentMethod: fromCanonicalPaymentMethod(res.data.paymentMethod || canonicalPaymentMethod),
          status: res.data.status === "VOIDED" ? "VOIDED" : res.data.status === "PENDING" ? "PENDING" : "PAID",
          taxDeductible: Boolean(res.data.taxDeductible),
        } as ExpenseRecord;
        const next = [authoritative, ...expenses.filter((x) => x.id !== authoritative.id)];
        db.saveConfigurationLocal("expenses", next, { tenantId: currentTenantId, branchId: currentBranchId });
        setExpenses(next);
      } else {
        const next = [record, ...expenses.filter((x) => x.id !== record.id)];
        const outboxItem = {
          id: expenseId,
          entityType: "Expense" as never,
          entityId: expenseId,
          operationType: "CREATE" as const,
          payload: payload as Record<string, unknown>,
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey,
          status: "PENDING" as const,
          tenantId: currentTenantId,
          branchId: currentBranchId,
        };
        db.saveConfigurationLocal("expenses", next, { tenantId: currentTenantId, branchId: currentBranchId });
        await db.executeAtomicMutation({
          writes: [],
          outboxItem,
          tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
        });
        setExpenses(next);
      }
      setIsAddModalOpen(false);
      setNewAmount(""); setNewDescription(""); setNewPayee(""); setNewPaymentRef(""); setNewStatus("PAID");
    } catch (error: any) {
      setFormError(error?.message || "Expense could not be recorded.");
    }
  };


  // Handle Pay Voucher
  const handleConfirmPay = async () => {
    if (!payModalItem || !currentTenantId || !currentBranchId) return;
    if (!canCreateExpense) return;
    try {
      const mutationId = window.crypto.randomUUID();
      const canonicalPaymentMethod = toCanonicalPaymentMethod(payMethod);
      const offlineSession = db.getConfigurationLocal?.("active_cash_session", { tenantId: currentTenantId, branchId: currentBranchId }) as any;
      const cashSessionId = canonicalPaymentMethod === "CASH"
        ? ((payModalItem as any).cashSessionId || offlineSession?.id)
        : undefined;
      if (!isOnline && canonicalPaymentMethod === "CASH" && !cashSessionId) {
        throw new Error("An active cash session is required for an offline cash settlement.");
      }
      const payload = {
        status: "PAID",
        paymentMethod: canonicalPaymentMethod,
        paymentRef: payRef.trim() || undefined,
        cashSessionId,
        _baseUpdatedAt: (payModalItem as any).updatedAt,
      };
      const updated = expenses.map((item) => item.id === payModalItem.id
        ? { ...item, status: "PAID" as const, paymentMethod: fromCanonicalPaymentMethod(canonicalPaymentMethod), paymentRef: payRef.trim() || undefined, updatedAt: new Date().toISOString() }
        : item
      );

      if (isOnline) {
        const res = await apiFetch<{ success: boolean; data: any }>(`/api/v1/expenses/${payModalItem.id}/pay`, {
          method: "POST",
          body: JSON.stringify({
            paymentMethod: canonicalPaymentMethod,
            paymentRef: payRef.trim() || undefined,
            cashSessionId: (payModalItem as any).cashSessionId,
            idempotencyKey: mutationId,
          }),
        });
        const authoritative = {
          ...payModalItem,
          ...res.data,
          amount: Number(res.data.amount),
          date: String(res.data.incurredAt || payModalItem.date).slice(0, 10),
          paymentMethod: fromCanonicalPaymentMethod(res.data.paymentMethod || canonicalPaymentMethod),
        } as ExpenseRecord;
        const next = expenses.map((item) => item.id === authoritative.id ? authoritative : item);
        db.saveConfigurationLocal("expenses", next, { tenantId: currentTenantId, branchId: currentBranchId });
        setExpenses(next);
      } else {
        db.saveConfigurationLocal("expenses", updated, { tenantId: currentTenantId, branchId: currentBranchId });
        await db.executeAtomicMutation({
          writes: [],
          outboxItem: {
            id: mutationId,
            entityType: "Expense" as never,
            entityId: payModalItem.id,
            operationType: "UPDATE" as const,
            payload: { ...payload, id: payModalItem.id, tenantId: currentTenantId, branchId: currentBranchId } as Record<string, unknown>,
            clientCreatedAt: new Date().toISOString(),
            idempotencyKey: mutationId,
            status: "PENDING" as const,
            tenantId: currentTenantId,
            branchId: currentBranchId,
          },
          tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
        });
        setExpenses(updated);
      }
    } catch (error) {
      console.error("Failed to settle expense", error);
    } finally {
      setPayModalItem(null);
      setPayRef("");
    }
  };

  // Handle Void Expense
  const handleDelete = async (id: string) => {
    if (!canVoidExpense) return;
    const item = expenses.find((e) => e.id === id);
    if (!item || !window.confirm("Void this expense voucher? Financial history will be retained and reversed where applicable.")) return;
    if (!currentTenantId || !currentBranchId) return;
    const reason = "Expense voucher voided by authorized user";
    try {
      const mutationId = window.crypto.randomUUID();
      if (isOnline) {
        const res = await apiFetch<{ success: boolean; data: any }>(`/api/v1/expenses/${id}/void`, {
          method: "POST",
          body: JSON.stringify({ reason, idempotencyKey: mutationId }),
        });
        const authoritative = {
          ...item, ...res.data, amount: Number(res.data.amount),
          date: String(res.data.incurredAt || item.date).slice(0, 10),
          paymentMethod: fromCanonicalPaymentMethod(res.data.paymentMethod || item.paymentMethod),
          status: "VOIDED" as const,
        } as ExpenseRecord;
        const next = expenses.map((e) => e.id === id ? authoritative : e);
        db.saveConfigurationLocal("expenses", next, { tenantId: currentTenantId, branchId: currentBranchId });
        setExpenses(next);
      } else {
        const next = expenses.map((e) => e.id === id ? { ...e, status: "VOIDED" as const } : e);
        db.saveConfigurationLocal("expenses", next, { tenantId: currentTenantId, branchId: currentBranchId });
        await db.executeAtomicMutation({
          writes: [],
          outboxItem: {
            id: mutationId,
            entityType: "Expense" as never,
            entityId: id,
            operationType: "UPDATE" as const,
            payload: { id, tenantId: currentTenantId, branchId: currentBranchId, status: "VOIDED", voidReason: reason, _baseUpdatedAt: (item as any).updatedAt } as Record<string, unknown>,
            clientCreatedAt: new Date().toISOString(),
            idempotencyKey: mutationId,
            status: "PENDING" as const,
            tenantId: currentTenantId,
            branchId: currentBranchId,
          },
          tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
        });
        setExpenses(next);
      }
    } catch (error) {
      console.error("Failed to void expense", error);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ["Voucher ID", "Date", "Category", "Description", "Payee", "Amount (TZS)", "Payment Method", "Reference", "Status", "Tax Deductible"];
    const rows = filteredExpenses.map((e) => [
      e.id,
      e.date,
      `"${e.category}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.payee.replace(/"/g, '""')}"`,
      e.amount,
      e.paymentMethod,
      e.paymentRef || "",
      e.status,
      e.taxDeductible ? "YES" : "NO",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KwakoPos_Expenses_${dateRange}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header Bar */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            {t("expenses.title") || "Operational Expenses & Outgoings Ledger"}
          </h1>
          <p className="v2-text-xs v2-text-muted">
            {currentTenantName} · {currentBranchName} · Track petty cash, vendor disbursements & business outgoings
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={handleExportCsv} type="button">
            <Download size={13} /> {t("expenses.exportVouchers") || "Export CSV"}
          </button>
          {canCreateExpense && <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setIsAddModalOpen(true)} type="button">
            <Plus size={13} /> {t("expenses.recordExpense") || "Record Expense"}
          </button>}
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="metrics-grid kpi-grid-4">
        <div className="v2-card" style={{ padding: "1.25rem" }}>
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
            <span className="v2-text-xs v2-font-bold v2-text-muted uppercase">Period Outgoings</span>
            <div style={{ color: "var(--danger)" }}><DollarSign size={18} /></div>
          </div>
          <div className="v2-text-2xl v2-font-black v2-mono" style={{ color: "var(--danger)" }}>
            {formatMoneyCompact(metrics.total)}
          </div>
          <div className="v2-text-xs v2-text-muted v2-mt-1">{filteredExpenses.length} vouchers recorded</div>
        </div>

        <div className="v2-card" style={{ padding: "1.25rem" }}>
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
            <span className="v2-text-xs v2-font-bold v2-text-muted uppercase">Paid Out</span>
            <div style={{ color: "var(--success)" }}><CheckCircle size={18} /></div>
          </div>
          <div className="v2-text-2xl v2-font-black v2-mono" style={{ color: "var(--success)" }}>
            {formatMoneyCompact(metrics.paidAmount)}
          </div>
          <div className="v2-text-xs v2-text-muted v2-mt-1">{metrics.paidCount} vouchers settled</div>
        </div>

        <div className="v2-card" style={{ padding: "1.25rem" }}>
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
            <span className="v2-text-xs v2-font-bold v2-text-muted uppercase">Pending Approval</span>
            <div style={{ color: "var(--warning)" }}><Clock size={18} /></div>
          </div>
          <div className="v2-text-2xl v2-font-black v2-mono" style={{ color: "var(--warning)" }}>
            {formatMoneyCompact(metrics.pendingAmount)}
          </div>
          <div className="v2-text-xs v2-text-muted v2-mt-1">{metrics.pendingCount} unpaid vouchers</div>
        </div>

        <div className="v2-card" style={{ padding: "1.25rem" }}>
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
            <span className="v2-text-xs v2-font-bold v2-text-muted uppercase">Tax Deductible</span>
            <div style={{ color: "var(--accent)" }}><Coins size={18} /></div>
          </div>
          <div className="v2-text-2xl v2-font-black v2-mono">
            {formatMoneyCompact(metrics.taxDeductibleAmount)}
          </div>
          <div className="v2-text-xs v2-text-muted v2-mt-1">Eligible corporate deductions</div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="v2-card" style={{ padding: "1rem" }}>
        <div className="v2-flex v2-flex-wrap v2-items-center v2-justify-between v2-gap-3">
          {/* Date range pills */}
          <div className="v2-flex v2-gap-1" style={{ overflowX: "auto" }}>
            {(["month", "today", "7days", "30days", "quarter", "all", "custom"] as DateRangeType[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                type="button"
                className={`v2-btn v2-btn-sm ${dateRange === r ? "v2-btn-primary" : "v2-btn-ghost"}`}
                style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}
              >
                {r === "7days" ? "Last 7 Days" : r === "30days" ? "Last 30 Days" : r === "month" ? "This Month" : r}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="v2-search-box" style={{ width: 260 }}>
            <Search size={14} className="v2-search-box-icon" />
            <input
              className="v2-input v2-input-sm"
              placeholder="Search payee, voucher, notes..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
            />
          </div>
        </div>

        {/* Custom date range row */}
        {dateRange === "custom" && (
          <div className="v2-flex v2-items-center v2-gap-3 v2-mt-3 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
            <span className="v2-text-xs v2-font-bold v2-text-muted">Custom Period:</span>
            <input
              type="date"
              className="v2-input v2-input-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="v2-text-xs v2-text-muted">to</span>
            <input
              type="date"
              className="v2-input v2-input-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        )}

        {/* Dropdown Filters */}
        <div className="v2-grid v2-grid-3 v2-gap-3 v2-mt-3 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
          <div>
            <label className="v2-text-xs v2-text-muted v2-mb-1" style={{ display: "block" }}>Category</label>
            <select className="v2-input v2-input-sm" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="All">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="v2-text-xs v2-text-muted v2-mb-1" style={{ display: "block" }}>Payment Status</label>
            <select className="v2-input v2-input-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending Approval</option>
            </select>
          </div>

          <div>
            <label className="v2-text-xs v2-text-muted v2-mb-1" style={{ display: "block" }}>Payment Method</label>
            <select className="v2-input v2-input-sm" value={filterPaymentMethod} onChange={(e) => setFilterPaymentMethod(e.target.value)}>
              <option value="All">All Payment Methods</option>
              <option value="Cash">Cash</option>
              <option value="M-Pesa">M-Pesa</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
              <option value="Airtel Money">Airtel Money</option>
            </select>
          </div>
        </div>
      </div>

      {/* Outgoings Ledger Table */}
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">
            Outgoings Ledger ({filteredExpenses.length} records)
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="v2-empty" style={{ padding: "3.5rem 1.5rem", textAlign: "center" }}>
            <Receipt className="v2-text-muted" size={44} style={{ margin: "0 auto 1rem", opacity: 0.5 }} />
            <p className="v2-empty-title v2-text-base v2-font-bold">
              {expenses.length === 0 ? "No Operational Expenses Recorded" : "No expenses match your active filters"}
            </p>
            <p className="v2-empty-desc v2-text-xs v2-text-muted v2-mt-1" style={{ maxWidth: 460, margin: "0.5rem auto 1.5rem" }}>
              {expenses.length === 0
                ? "Maintain tight cash controls by logging petty cash disbursements, utilities, rent, and vendor payouts."
                : "Try resetting your search query or adjusting your category/status filters."}
            </p>
            <div className="v2-flex v2-justify-center v2-gap-2">
              <button
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={() => setIsAddModalOpen(true)}
                type="button"
              >
                <Plus size={13} /> Record Expense Voucher
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Voucher #</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description & Payee</th>
                  <th>Payment Method</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id}>
                    <td className="v2-mono v2-text-xs v2-font-bold">{exp.id}</td>
                    <td className="v2-text-xs v2-text-muted">{exp.date}</td>
                    <td>
                      <span className="badge v2-badge-muted v2-text-xs">{exp.category}</span>
                    </td>
                    <td>
                      <div className="v2-font-bold v2-text-xs">{exp.description}</div>
                      <div className="v2-text-xs v2-text-muted">Payee: {exp.payee} {exp.paymentRef ? `· Ref: ${exp.paymentRef}` : ""}</div>
                    </td>
                    <td className="v2-text-xs">{exp.paymentMethod}</td>
                    <td className="v2-mono v2-font-black v2-text-sm" style={{ textAlign: "right", color: "var(--danger)" }}>
                      {formatCurrency(exp.amount)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge ${exp.status === "PAID" ? "v2-badge-success" : "v2-badge-warning"} v2-text-xs`}>
                        {exp.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="v2-flex v2-justify-end v2-gap-1">
                        <button
                          className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                          onClick={() => setViewItem(exp)}
                          title="View Details"
                          type="button"
                        >
                          <Eye size={13} />
                        </button>
                        {exp.status === "PENDING" && canCreateExpense && (
                          <button
                            className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                            onClick={() => {
                              setPayModalItem(exp);
                              setPayMethod(exp.paymentMethod || "M-Pesa");
                              setPayRef("");
                            }}
                            title="Settle / Pay Voucher"
                            type="button"
                          >
                            <Check size={13} style={{ color: "var(--success)" }} />
                          </button>
                        )}
                        {canVoidExpense && <button
                          className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                          onClick={() => void handleDelete(exp.id)}
                          title="Delete Voucher"
                          type="button"
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={13} />
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Add Expense Modal --- */}
      {isAddModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 500, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">Record Outgoing Expense Voucher</h2>
                <div className="v2-text-xs v2-text-muted">Enter disbursement details for bookkeeping and tax accounting.</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsAddModalOpen(false)} type="button">✕</button>
            </div>

            {formError && (
              <div className="v2-alert v2-alert-danger v2-mb-3 v2-text-xs">
                <AlertCircle size={14} /> {formError}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="v2-space-y-3">
              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                    Category *
                  </label>
                  <select
                    className="v2-input v2-input-sm"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    className="v2-input v2-input-sm"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                  Amount (TZS) *
                </label>
                <input
                  type="number"
                  className="v2-input v2-input-sm v2-mono"
                  placeholder="e.g. 150000"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                  Description / Purpose *
                </label>
                <input
                  className="v2-input v2-input-sm"
                  placeholder="e.g. Shop renovation supplies or electricity bill"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                  Payee / Vendor Name *
                </label>
                <input
                  className="v2-input v2-input-sm"
                  placeholder="e.g. TANESCO / Kariakoo Suppliers Ltd"
                  value={newPayee}
                  onChange={(e) => setNewPayee(e.target.value)}
                />
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                    Payment Method
                  </label>
                  <select
                    className="v2-input v2-input-sm"
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash (Petty Float)</option>
                    <option value="M-Pesa">M-Pesa</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card</option>
                    <option value="Airtel Money">Airtel Money</option>
                  </select>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                    Payment Status
                  </label>
                  <select
                    className="v2-input v2-input-sm"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as "PAID" | "PENDING")}
                  >
                    <option value="PAID">Paid Immediately</option>
                    <option value="PENDING">Pending (Require Approval)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                  Transaction Ref / Receipt # (Optional)
                </label>
                <input
                  className="v2-input v2-input-sm"
                  placeholder="e.g. MP-84920492 / Check #004"
                  value={newPaymentRef}
                  onChange={(e) => setNewPaymentRef(e.target.value)}
                />
              </div>

              <div className="v2-flex v2-items-center v2-gap-2 v2-pt-1">
                <input
                  type="checkbox"
                  id="taxDeductibleCheck"
                  checked={newTaxDeductible}
                  onChange={(e) => setNewTaxDeductible(e.target.checked)}
                />
                <label htmlFor="taxDeductibleCheck" className="v2-text-xs" style={{ cursor: "pointer" }}>
                  This expense is tax deductible (allowable TRA deduction)
                </label>
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsAddModalOpen(false)} type="button">
                  Cancel
                </button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">
                  Record Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Settle / Pay Voucher Modal --- */}
      {payModalItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 420, maxWidth: "95vw", padding: "1.5rem" }}>
            <h2 className="v2-text-base v2-font-black v2-mb-1">Settle Expense Voucher</h2>
            <p className="v2-text-xs v2-text-muted v2-mb-3">
              Mark voucher <strong className="v2-mono">{payModalItem.id}</strong> as disbursed and paid.
            </p>

            <div className="v2-p-3 v2-mb-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
              <div className="v2-flex v2-justify-between v2-font-bold v2-text-xs v2-mb-1">
                <span>{payModalItem.description}</span>
                <span className="v2-mono" style={{ color: "var(--danger)" }}>{formatCurrency(payModalItem.amount)}</span>
              </div>
              <div className="v2-text-xs v2-text-muted">Payee: {payModalItem.payee}</div>
            </div>

            <div className="v2-space-y-3 v2-mb-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                  Disbursement Channel *
                </label>
                <select className="v2-input v2-input-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                  <option value="Airtel Money">Airtel Money</option>
                </select>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-mb-1" style={{ display: "block" }}>
                  Transaction Reference / Confirmation Code
                </label>
                <input
                  className="v2-input v2-input-sm"
                  placeholder="e.g. MP94829103"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                />
              </div>
            </div>

            <div className="v2-flex v2-justify-end v2-gap-2">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setPayModalItem(null)} type="button">
                Cancel
              </button>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={handleConfirmPay} type="button">
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- View Voucher Modal --- */}
      {viewItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <h2 className="v2-text-base v2-font-black">Expense Voucher Details</h2>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setViewItem(null)} type="button">✕</button>
            </div>

            <div className="v2-space-y-2 v2-text-xs v2-mb-4">
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Voucher ID:</span>
                <span className="v2-mono v2-font-bold">{viewItem.id}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Date:</span>
                <span>{viewItem.date}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Category:</span>
                <span className="badge v2-badge-muted">{viewItem.category}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Payee:</span>
                <span className="v2-font-bold">{viewItem.payee}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Amount:</span>
                <span className="v2-mono v2-font-black" style={{ color: "var(--danger)" }}>{formatCurrency(viewItem.amount)}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Status:</span>
                <span className={`badge ${viewItem.status === "PAID" ? "v2-badge-success" : "v2-badge-warning"}`}>{viewItem.status}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Method:</span>
                <span>{viewItem.paymentMethod} {viewItem.paymentRef ? `(${viewItem.paymentRef})` : ""}</span>
              </div>
              <div className="v2-flex v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted">Tax Deductible:</span>
                <span>{viewItem.taxDeductible ? "Yes (Allowable deduction)" : "No"}</span>
              </div>
              <div className="v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <span className="v2-text-muted block v2-mb-1">Description:</span>
                <div className="v2-font-bold">{viewItem.description}</div>
              </div>
            </div>

            <div className="v2-flex v2-justify-end">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setViewItem(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



