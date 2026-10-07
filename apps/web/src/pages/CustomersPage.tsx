import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, User, Phone, Mail, Search, Edit2, Archive, UserPlus, Wallet,
  RefreshCw, History, Eye, Upload, Download, UserRoundCog, ArrowLeft,
} from "lucide-react";
import { useBranch, useModule, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/applicationApiService.js";
import { useToast } from "../context/ToastContext.js";
import { DATA_CHANGED_EVENT, publishDataChanged } from "../services/dataChangeEvent.js";
import { commitLocalMutation } from "../persistence/commitLocalMutation.js";

export interface CustomerRecord {
  id: string;
  customerCode?: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  status: string;
  outstandingBalance: number;
  creditLimit: number;
  walletBalance: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerContactRecord {
  id: string;
  customerId: string;
  contactCode?: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notes: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

const fmtCcy = (n: number) => `Tsh ${Math.round(Number(n) || 0).toLocaleString()}`;
const uuid = () => globalThis.crypto.randomUUID();

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((v) => v.trim() !== "")).map((r) => Object.fromEntries(
    headers.map((h, i) => [h, String(r[i] ?? "").trim()])
  ));
}

function downloadCsv(rows: Record<string, unknown>[], filename: string, headers = ["customerCode", "name", "phone", "email", "address", "creditLimit", "currentBalance", "walletBalance", "status"]) {
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface CustomersPageProps {
  activeTab?: string;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ activeTab }) => {
  const { activeModule } = useModule();
  const { isOnline, pendingOutboxCount, db } = useSync();
  const { currentTenantId } = useTenant();
  const { currentBranchId } = useBranch();
  const toast = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [contacts, setContacts] = useState<CustomerContactRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCust, setSelectedCust] = useState<CustomerRecord | null>(null);
  const [selectedContact, setSelectedContact] = useState<CustomerContactRecord | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<any | null>(null);
  const [contactHistory, setContactHistory] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCreditLimit, setFormCreditLimit] = useState(0);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentValue, setPaymentValue] = useState(0);
  const [payUsingWallet, setPayUsingWallet] = useState(false);

  const [walletOpen, setWalletOpen] = useState(false);
  const [walletValue, setWalletValue] = useState(0);

  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactFormMode, setContactFormMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [contactPrimary, setContactPrimary] = useState(false);
  const [contactCustomerId, setContactCustomerId] = useState("");

  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const targetType = useMemo(() => {
    switch (activeModule) {
      case "Pharmacy": return "Patient";
      case "SACCO": return "Member";
      case "Law": return "Client";
      case "RealEstate": return "Tenant";
      case "School": return "Student";
      case "Hotel": return "Guest";
      default: return "Customer";
    }
  }, [activeModule]);

  const pageTitle = useMemo(() => {
    switch (activeModule) {
      case "Pharmacy": return "Patient Database & Profiles";
      case "SACCO": return "Member Directory & Balances";
      case "Law": return "Client Directory & Balances";
      default: return "Customer Directory & Credit Ledger";
    }
  }, [activeModule]);

  const normalizeCustomer = useCallback((c: any): CustomerRecord => ({
    id: String(c.id),
    customerCode: c.customerCode,
    name: String(c.name || ""),
    phone: String(c.phone || ""),
    email: String(c.email || ""),
    address: String(c.address || ""),
    status: String(c.status || "ACTIVE"),
    outstandingBalance: Number(c.currentBalance ?? c.outstandingBalance ?? c.debt ?? 0),
    creditLimit: Number(c.creditLimit || 0),
    walletBalance: Number(c.walletBalance || 0),
    createdAt: c.createdAt ? String(c.createdAt) : undefined,
    updatedAt: c.updatedAt ? String(c.updatedAt) : undefined,
  }), []);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: any[] }>("/api/v1/customers");
      if (res.success && Array.isArray(res.data)) {
        setCustomers(res.data.map(normalizeCustomer).filter((c) => c.status !== "SUSPENDED"));
        return;
      }
    } catch {
      // Offline path below.
    }
    await db.ready;
    const local = db.getCustomersLocal(currentTenantId || undefined, currentBranchId || undefined)
      .map(normalizeCustomer)
      .filter((c) => c.status !== "SUSPENDED");
    const pending = [...db.syncOutbox.values()]
      .filter((item) => item.entityType === "Customer" && item.status !== "FAILED")
      .map((item) => normalizeCustomer({ ...(item.payload || {}), id: item.entityId }));
    const merged = [...local];
    for (const item of pending) if (!merged.some((c) => c.id === item.id)) merged.unshift(item);
    setCustomers(merged);
    setIsLoading(false);
  }, [currentBranchId, currentTenantId, db, normalizeCustomer]);

  const loadContacts = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: any[] }>("/api/v1/contacts");
      if (res.success && Array.isArray(res.data)) {
        setContacts(res.data.map((c) => ({
          id: String(c.id), customerId: String(c.customerId), contactCode: c.contactCode,
          firstName: String(c.firstName || ""), lastName: String(c.lastName || ""),
          roleTitle: String(c.roleTitle || ""), phone: String(c.phone || ""), email: String(c.email || ""),
          isPrimary: Boolean(c.isPrimary), notes: String(c.notes || ""), status: String(c.status || "ACTIVE"),
          createdAt: c.createdAt ? String(c.createdAt) : undefined, updatedAt: c.updatedAt ? String(c.updatedAt) : undefined,
        })));
        return;
      }
    } catch {
      // Offline path below.
    }
    await db.ready;
    setContacts((db.getCustomerContactsLocal(currentTenantId || undefined, currentBranchId || undefined) as any[])
      .filter((c) => c.status !== "SUSPENDED"));
  }, [currentBranchId, currentTenantId, db]);

  useEffect(() => {
    void loadCustomers();
    void loadContacts();
    const refresh = () => { void loadCustomers(); void loadContacts(); };
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [loadContacts, loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => [c.customerCode, c.name, c.phone, c.email, c.address].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [customers, searchQuery]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const active = contacts.filter((c) => c.status !== "SUSPENDED");
    if (!q) return active;
    return active.filter((c) => [c.firstName, c.lastName, c.roleTitle, c.phone, c.email, c.contactCode].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [contacts, searchQuery]);

  const stats = useMemo(() => ({
    total: customers.length,
    debt: customers.reduce((s, c) => s + c.outstandingBalance, 0),
    wallet: customers.reduce((s, c) => s + c.walletBalance, 0),
  }), [customers]);

  const tenantContext = useMemo(() => {
    if (!currentTenantId || !currentBranchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
    return { tenantId: currentTenantId, branchId: currentBranchId };
  }, [currentBranchId, currentTenantId]);

  const resetCustomerForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormAddress("");
    setFormCreditLimit(0);
  };

  const openCustomerForm = (customer?: CustomerRecord) => {
    if (customer) {
      setSelectedCust(customer);
      setFormMode("EDIT");
      setFormName(customer.name);
      setFormPhone(customer.phone);
      setFormEmail(customer.email);
      setFormAddress(customer.address || "");
      setFormCreditLimit(customer.creditLimit);
    } else {
      setSelectedCust(null);
      resetCustomerForm();
      setFormMode("CREATE");
    }
    setFormOpen(true);
  };

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      toast.warning("Required fields", "Name and phone number are required.");
      return;
    }
    try {
      const ctx = tenantContext;
      if (formMode === "CREATE") {
        const id = uuid();
        const customer = {
          id, tenantId: ctx.tenantId, branchId: ctx.branchId, customerCode: `CUST-${id.slice(0, 8).toUpperCase()}`,
          name: formName.trim(), phone: formPhone.trim(), email: formEmail.trim() || undefined, address: formAddress.trim() || undefined,
          creditLimit: Math.max(0, formCreditLimit), currentBalance: 0, openingBalance: 0, walletBalance: 0, status: "ACTIVE",
        };
        await commitLocalMutation({
          db, tenantContext: ctx, entityType: "Customer", entityId: id, operationType: "CREATE",
          payload: customer, idempotencyKey: id,
          writes: [{ store: "customers", key: id, value: customer }],
        });
        setCustomers((prev) => [normalizeCustomer(customer), ...prev]);
        toast.success("Customer saved", `${targetType} queued for authoritative synchronization.`);
        publishDataChanged({ action: "CUSTOMER_CREATED", customer });
      } else if (selectedCust) {
        const updated = {
          ...selectedCust, name: formName.trim(), phone: formPhone.trim(), email: formEmail.trim(),
          address: formAddress.trim(), creditLimit: Math.max(0, formCreditLimit), _baseUpdatedAt: selectedCust.updatedAt,
        };
        await commitLocalMutation({
          db, tenantContext: ctx, entityType: "Customer", entityId: selectedCust.id, operationType: "UPDATE",
          payload: { name: updated.name, phone: updated.phone, email: updated.email, address: updated.address, creditLimit: updated.creditLimit, _baseUpdatedAt: selectedCust.updatedAt },
          idempotencyKey: uuid(),
          writes: [{ store: "customers", key: selectedCust.id, value: updated }],
        });
        setCustomers((prev) => prev.map((c) => c.id === selectedCust.id ? normalizeCustomer(updated) : c));
        toast.success("Customer updated", "Profile change queued for authoritative synchronization.");
        publishDataChanged({ action: "CUSTOMER_UPDATED", customer: updated });
      }
      setFormOpen(false);
      resetCustomerForm();
    } catch (error: any) {
      toast.error("Customer save blocked", error?.message || "Unable to persist the customer.");
    }
  };

  const archiveCustomer = async (customer: CustomerRecord) => {
    if (customer.outstandingBalance !== 0 || customer.walletBalance !== 0) {
      toast.warning("Archive blocked", "Clear the outstanding balance and wallet balance before archiving this profile.");
      return;
    }
    if (!confirm(`Archive ${customer.name}?`)) return;
    try {
      await commitLocalMutation({
        db, tenantContext: tenantContext, entityType: "Customer", entityId: customer.id, operationType: "UPDATE",
        payload: { status: "SUSPENDED", _baseUpdatedAt: customer.updatedAt },
        idempotencyKey: uuid(),
        writes: [{ store: "customers", key: customer.id, value: { ...customer, status: "SUSPENDED" } }],
      });
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      toast.success("Profile archived", "The archive operation is queued for authoritative synchronization.");
      publishDataChanged({ action: "CUSTOMER_ARCHIVED", customerId: customer.id });
    } catch (error: any) {
      toast.error("Archive blocked", error?.message || "Unable to archive this customer.");
    }
  };

  const openTransactions = async (customer: CustomerRecord) => {
    try {
      const res = await apiFetch<{ success: boolean; data: any }>(`/api/v1/customers/${customer.id}/transactions`);
      setCustomerTransactions(res.data);
    } catch {
      const sales = [...db.sales.values()].filter((s: any) => s.customerId === customer.id);
      const payments = [...db.payments.values()].filter((p: any) => p.customerId === customer.id);
      setCustomerTransactions({ customer, sales, payments, returns: [] });
    }
    setTransactionsOpen(true);
  };

  const openPayment = (customer: CustomerRecord) => {
    setSelectedCust(customer);
    setPaymentValue(0);
    setPayUsingWallet(false);
    setPaymentOpen(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || paymentValue <= 0 || paymentValue > selectedCust.outstandingBalance) {
      toast.warning("Invalid repayment", "Enter a repayment amount no greater than the current outstanding balance.");
      return;
    }
    if (payUsingWallet && paymentValue > selectedCust.walletBalance) {
      toast.warning("Insufficient wallet", "The wallet balance is lower than this repayment amount.");
      return;
    }
    try {
      const id = uuid();
      const updated = {
        ...selectedCust,
        outstandingBalance: selectedCust.outstandingBalance - paymentValue,
        walletBalance: payUsingWallet ? selectedCust.walletBalance - paymentValue : selectedCust.walletBalance,
        currentBalance: selectedCust.outstandingBalance - paymentValue,
        updatedAt: new Date().toISOString(),
      };
      const payment = {
        id, tenantId: tenantContext.tenantId, branchId: tenantContext.branchId, customerId: selectedCust.id,
        amount: paymentValue, paymentMethod: payUsingWallet ? "WALLET" : "CASH", status: "PENDING",
        paidAt: new Date().toISOString(), paymentNumber: `PAY-CUST-${id.slice(0, 8).toUpperCase()}`,
      };
      await commitLocalMutation({
        db, tenantContext, entityType: "Payment", entityId: id, operationType: "CREATE",
        payload: { id, customerId: selectedCust.id, amount: paymentValue, payUsingWallet, paymentMethod: payment.paymentMethod, _baseUpdatedAt: selectedCust.updatedAt },
        idempotencyKey: id,
        writes: [{ store: "customers", key: selectedCust.id, value: updated }, { store: "payments", key: id, value: payment }],
      });
      setCustomers((prev) => prev.map((c) => c.id === selectedCust.id ? normalizeCustomer(updated) : c));
      setPaymentOpen(false);
      toast.success("Repayment queued", "The authoritative customer balance will reconcile after synchronization.");
      publishDataChanged({ action: "CUSTOMER_PAYMENT_QUEUED", customerId: selectedCust.id });
    } catch (error: any) {
      toast.error("Repayment blocked", error?.message || "Unable to queue repayment.");
    }
  };

  const submitWalletDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || walletValue <= 0) {
      toast.warning("Invalid wallet deposit", "Enter a positive deposit amount.");
      return;
    }
    try {
      const id = uuid();
      const updated = { ...selectedCust, walletBalance: selectedCust.walletBalance + walletValue, updatedAt: new Date().toISOString() };
      const payment = {
        id, tenantId: tenantContext.tenantId, branchId: tenantContext.branchId, customerId: selectedCust.id,
        amount: walletValue, paymentMethod: "CASH", status: "PENDING",
        paidAt: new Date().toISOString(), paymentNumber: `WALLET-${id.slice(0, 8).toUpperCase()}`,
      };
      await commitLocalMutation({
        db, tenantContext, entityType: "Payment", entityId: id, operationType: "CREATE",
        payload: { id, customerId: selectedCust.id, amount: walletValue, walletDepositAmount: walletValue, kind: "WALLET_DEPOSIT", paymentMethod: "CASH" },
        idempotencyKey: id,
        writes: [{ store: "customers", key: selectedCust.id, value: updated }, { store: "payments", key: id, value: payment }],
      });
      setCustomers((prev) => prev.map((c) => c.id === selectedCust.id ? normalizeCustomer(updated) : c));
      setWalletOpen(false);
      toast.success("Wallet deposit queued", "The wallet ledger will reconcile after synchronization.");
      publishDataChanged({ action: "CUSTOMER_WALLET_QUEUED", customerId: selectedCust.id });
    } catch (error: any) {
      toast.error("Wallet deposit blocked", error?.message || "Unable to queue wallet deposit.");
    }
  };

  const resetContactForm = () => {
    setContactFirstName("");
    setContactLastName("");
    setContactRole("");
    setContactPhone("");
    setContactEmail("");
    setContactNotes("");
    setContactPrimary(false);
    setContactCustomerId("");
  };

  const openContactForm = (contact?: CustomerContactRecord) => {
    if (contact) {
      setSelectedContact(contact);
      setContactFormMode("EDIT");
      setContactFirstName(contact.firstName);
      setContactLastName(contact.lastName);
      setContactRole(contact.roleTitle);
      setContactPhone(contact.phone);
      setContactEmail(contact.email);
      setContactNotes(contact.notes);
      setContactPrimary(contact.isPrimary);
      setContactCustomerId(contact.customerId);
    } else {
      setSelectedContact(null);
      setContactFormMode("CREATE");
      resetContactForm();
      if (customers[0]) setContactCustomerId(customers[0].id);
    }
    setContactFormOpen(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactCustomerId || !contactFirstName.trim()) {
      toast.warning("Required fields", "Select a customer and enter the contact's first name.");
      return;
    }
    try {
      const id = selectedContact?.id || uuid();
      const basePayload = {
        customerId: contactCustomerId,
        firstName: contactFirstName.trim(), lastName: contactLastName.trim(), roleTitle: contactRole.trim(),
        phone: contactPhone.trim(), email: contactEmail.trim(), notes: contactNotes.trim(), isPrimary: contactPrimary,
      };
      if (contactFormMode === "CREATE") {
        const row = {
          id, tenantId: tenantContext.tenantId, branchId: tenantContext.branchId,
          contactCode: `CNT-${id.slice(0, 8).toUpperCase()}`, ...basePayload, status: "ACTIVE",
        };
        await commitLocalMutation({
          db, tenantContext, entityType: "CustomerContact", entityId: id, operationType: "CREATE",
          payload: row, idempotencyKey: id,
          writes: [{ store: "customerContacts", key: id, value: row }],
        });
        setContacts((prev) => [row, ...prev]);
      } else if (selectedContact) {
        const row = { ...selectedContact, ...basePayload, _baseUpdatedAt: selectedContact.updatedAt, updatedAt: new Date().toISOString() };
        await commitLocalMutation({
          db, tenantContext, entityType: "CustomerContact", entityId: id, operationType: "UPDATE",
          payload: { ...basePayload, _baseUpdatedAt: selectedContact.updatedAt },
          idempotencyKey: uuid(),
          writes: [{ store: "customerContacts", key: id, value: row }],
        });
        setContacts((prev) => prev.map((c) => c.id === id ? row as CustomerContactRecord : c));
      }
      setContactFormOpen(false);
      resetContactForm();
      toast.success("Contact saved", "Contact change queued for authoritative synchronization.");
      publishDataChanged({ action: contactFormMode === "CREATE" ? "CUSTOMER_CONTACT_CREATED" : "CUSTOMER_CONTACT_UPDATED", contactId: id });
    } catch (error: any) {
      toast.error("Contact save blocked", error?.message || "Unable to persist contact.");
    }
  };

  const archiveContact = async (contact: CustomerContactRecord) => {
    if (!confirm(`Archive contact ${contact.firstName} ${contact.lastName}?`)) return;
    try {
      await commitLocalMutation({
        db, tenantContext, entityType: "CustomerContact", entityId: contact.id, operationType: "UPDATE",
        payload: { status: "SUSPENDED", _baseUpdatedAt: contact.updatedAt },
        idempotencyKey: uuid(),
        writes: [{ store: "customerContacts", key: contact.id, value: { ...contact, status: "SUSPENDED" } }],
      });
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      toast.success("Contact archived", "The archive operation is queued for synchronization.");
    } catch (error: any) {
      toast.error("Archive blocked", error?.message || "Unable to archive contact.");
    }
  };

  const openContactHistory = async (contact: CustomerContactRecord) => {
    try {
      const res = await apiFetch<{ success: boolean; data: any[] }>(`/api/v1/contacts/${contact.id}/history`);
      setContactHistory(Array.isArray(res.data) ? res.data : []);
    } catch {
      setContactHistory(
        [...db.syncOutbox.values()]
          .filter((item) => item.entityType === "CustomerContact" && item.entityId === contact.id)
          .map((item) => ({ id: item.id, action: `LOCAL_${item.operationType}`, entityType: "CustomerContact", entityId: contact.id, metadata: item.payload, createdAt: item.clientCreatedAt }))
      );
    }
    setSelectedContact(contact);
    setHistoryOpen(true);
  };

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isOnline) {
      toast.warning("Import requires connection", "Bulk import is an authoritative server operation and must be completed online.");
      return;
    }
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CSV_FILE_EMPTY");
      const res = await apiFetch<{ success: boolean; data: any[] }>("/api/v1/customers/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      if (!res.success) throw new Error("CUSTOMER_IMPORT_FAILED");
      await loadCustomers();
      toast.success("Import completed", `${res.data.filter((x) => x.imported).length} customer records imported; duplicates were retained safely.`);
    } catch (error: any) {
      toast.error("Import blocked", error?.message || "Unable to import customers.");
    }
  };

  const importContactFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isOnline) {
      toast.warning("Import requires connection", "Bulk contact import is an authoritative server operation and must be completed online.");
      return;
    }
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CONTACT_CSV_FILE_EMPTY");
      const res = await apiFetch<{ success: boolean; data: any[] }>("/api/v1/contacts/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      if (!res.success) throw new Error("CONTACT_IMPORT_FAILED");
      await loadContacts();
      toast.success("Contact import completed", `${res.data.filter((x) => x.imported).length} contacts imported.`);
    } catch (error: any) {
      toast.error("Contact import blocked", error?.message || "Unable to import contacts.");
    }
  };

  const tab = String(activeTab || "Customers");
  const showingContacts = /contact/i.test(tab);
  const showingTransactions = /transaction/i.test(tab);

  const filteredForContacts = filteredContacts.map((contact) => ({
    ...contact,
    customerName: customers.find((c) => c.id === contact.customerId)?.name || contact.customerId,
  }));

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      <div className="v2-flex v2-items-center v2-justify-between" style={{ flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h1 className="v2-text-xl v2-font-black">{showingContacts ? "Customer Contacts" : showingTransactions ? "Customer Transaction History" : pageTitle}</h1>
          <p className="v2-text-xs v2-text-muted">
            {showingContacts
              ? "Tenant-scoped contact directory, search, history, and synchronization."
              : showingTransactions
                ? "Authoritative customer sales, repayments, returns, credit, and wallet history."
                : `Authoritative ${targetType.toLowerCase()} profiles, credit limits, balances, and wallet controls.`}
          </p>
        </div>
        <div className="v2-flex v2-items-center v2-gap-2">
          <span className="badge v2-badge-muted">{isOnline ? "ONLINE" : "OFFLINE"}</span>
          {pendingOutboxCount > 0 && <span className="badge v2-badge-warning">{pendingOutboxCount} queued</span>}
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => { void loadCustomers(); void loadContacts(); }} disabled={isLoading} type="button">
            <RefreshCw size={13} className={isLoading ? "v2-spin" : ""} /> Refresh
          </button>
          {showingContacts ? (
            <>
              <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => downloadCsv(
                contacts.map((c) => ({ contactCode: c.contactCode, customerId: c.customerId, firstName: c.firstName, lastName: c.lastName, roleTitle: c.roleTitle, phone: c.phone, email: c.email, isPrimary: c.isPrimary, notes: c.notes, status: c.status })),
                "customer-contacts.csv",
                ["contactCode", "customerId", "firstName", "lastName", "roleTitle", "phone", "email", "isPrimary", "notes", "status"],
              )} type="button"><Download size={13} /> Export</button>
              <label className={`v2-btn v2-btn-secondary v2-btn-sm${isOnline ? "" : " v2-opacity-50"}`} style={{ cursor: isOnline ? "pointer" : "not-allowed" }}>
                <Upload size={13} /> Import CSV
                <input hidden type="file" accept=".csv,text/csv" onChange={importContactFile} disabled={!isOnline} />
              </label>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => openContactForm()} type="button"><UserPlus size={13} /> Add Contact</button>
            </>
          ) : !showingTransactions ? (
            <>
              <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => downloadCsv(customers, "customers.csv")} type="button"><Download size={13} /> Export</button>
              <label className={`v2-btn v2-btn-secondary v2-btn-sm${isOnline ? "" : " v2-opacity-50"}`} style={{ cursor: isOnline ? "pointer" : "not-allowed" }}>
                <Upload size={13} /> Import CSV
                <input hidden type="file" accept=".csv,text/csv" onChange={importFile} disabled={!isOnline} />
              </label>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => openCustomerForm()} type="button"><UserPlus size={13} /> Add {targetType}</button>
            </>
          ) : null}
        </div>
      </div>

      <div className="v2-flex v2-gap-2 v2-flex-wrap">
        {["Customers", "Contacts", "Transaction History"].map((label) => (
          <button
            key={label}
            className={`v2-btn v2-btn-sm ${((label === "Contacts" && showingContacts) || (label === "Transaction History" && showingTransactions) || (label === "Customers" && !showingContacts && !showingTransactions)) ? "v2-btn-primary" : "v2-btn-ghost"}`}
            type="button"
            onClick={() => {
              if (label === "Contacts") window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { activeTab: "Contacts" } }));
              else if (label === "Transaction History") window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { activeTab: "Transaction History" } }));
              else window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { activeTab: "Customers" } }));
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {!showingContacts && !showingTransactions && (
        <>
          <div className="metrics-grid kpi-grid-3">
            <div className="kpi-card"><div className="kpi-card-label">Registered</div><div className="kpi-card-value">{stats.total}</div><div className="kpi-card-desc">Active profiles</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Outstanding Credit</div><div className="kpi-card-value" style={{ color: "var(--danger)" }}>{fmtCcy(stats.debt)}</div><div className="kpi-card-desc">Authoritative customer balance</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Wallet Funds</div><div className="kpi-card-value" style={{ color: "var(--success)" }}>{fmtCcy(stats.wallet)}</div><div className="kpi-card-desc">Prepaid customer wallets</div></div>
          </div>
        </>
      )}

      <div className="v2-flex v2-items-center v2-gap-2">
        <Search size={14} className="v2-text-muted" />
        <input className="v2-input v2-input-sm" style={{ flex: 1, maxWidth: 520 }} placeholder={showingContacts ? "Search contacts by name, role, phone, or email..." : "Search customers by code, name, phone, email, or address..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {showingContacts ? (
        <div className="v2-grid v2-grid-2 v2-gap-4">
          {filteredForContacts.length === 0 ? (
            <div className="v2-empty" style={{ gridColumn: "1 / -1", padding: "3rem", textAlign: "center" }}>
              <UserRoundCog size={40} className="v2-text-muted" style={{ margin: "0 auto 1rem" }} />
              <div className="v2-font-bold">No contacts found</div>
              <div className="v2-text-xs v2-text-muted">Add decision-makers, accounts payable contacts, or other customer representatives.</div>
            </div>
          ) : filteredForContacts.map((c) => (
            <div key={c.id} className="v2-card" style={{ padding: "1.1rem" }}>
              <div className="v2-flex v2-items-start v2-justify-between">
                <div>
                  <div className="v2-font-bold">{c.firstName} {c.lastName}</div>
                  <div className="v2-text-xs v2-text-muted">{c.roleTitle || "Contact"} · {c.customerName}</div>
                </div>
                {c.isPrimary && <span className="badge v2-badge-success">Primary</span>}
              </div>
              <div className="v2-space-y-1 v2-text-xs v2-text-muted v2-mt-3">
                <div><Phone size={12} style={{ display: "inline", marginRight: 6 }} />{c.phone || "No phone"}</div>
                <div><Mail size={12} style={{ display: "inline", marginRight: 6 }} />{c.email || "No email"}</div>
              </div>
              <div className="v2-flex v2-gap-2 v2-mt-3">
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => void openContactHistory(c)} type="button"><History size={13} /> History</button>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => openContactForm(c)} type="button"><Edit2 size={13} /></button>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ color: "var(--danger)" }} onClick={() => void archiveContact(c)} type="button"><Archive size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="v2-grid v2-grid-3 v2-gap-4">
          {(showingTransactions ? customers : filteredCustomers).length === 0 ? (
            <div className="v2-empty" style={{ gridColumn: "1 / -1", padding: "3.5rem 1.5rem", textAlign: "center" }}>
              <Users size={44} className="v2-text-muted" style={{ margin: "0 auto 1rem" }} />
              <div className="v2-empty-title v2-font-bold">{showingTransactions ? "No customer transactions available" : `No ${targetType.toLowerCase()} profiles registered`}</div>
            </div>
          ) : (showingTransactions ? customers : filteredCustomers).map((c) => (
            <div key={c.id} className="v2-card" style={{ padding: "1.15rem" }}>
              <div className="v2-flex v2-items-start v2-justify-between">
                <div>
                  <div className="v2-font-bold">{c.name}</div>
                  <div className="v2-text-xs v2-text-muted">{c.customerCode || c.id}</div>
                </div>
                <span className={`badge ${c.outstandingBalance > 0 ? "v2-badge-danger" : "v2-badge-success"}`}>{c.outstandingBalance > 0 ? "Debt Due" : "Zero Balance"}</span>
              </div>
              <div className="v2-space-y-1 v2-text-xs v2-text-muted v2-mt-3">
                <div><Phone size={12} style={{ display: "inline", marginRight: 6 }} />{c.phone}</div>
                {c.email && <div><Mail size={12} style={{ display: "inline", marginRight: 6 }} />{c.email}</div>}
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2 v2-mt-3 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <div><div className="v2-text-xs v2-text-muted">CREDIT LIMIT</div><div className="v2-mono v2-font-black">{fmtCcy(c.creditLimit)}</div></div>
                <div><div className="v2-text-xs v2-text-muted">BALANCE</div><div className="v2-mono v2-font-black" style={{ color: c.outstandingBalance > 0 ? "var(--danger)" : "var(--text)" }}>{fmtCcy(c.outstandingBalance)}</div></div>
                <div><div className="v2-text-xs v2-text-muted">WALLET</div><div className="v2-mono v2-font-black" style={{ color: "var(--success)" }}>{fmtCcy(c.walletBalance)}</div></div>
                <div><div className="v2-text-xs v2-text-muted">STATUS</div><div className="v2-mono v2-font-black">{c.status}</div></div>
              </div>
              <div className="v2-flex v2-gap-2 v2-mt-3" style={{ flexWrap: "wrap" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => void openTransactions(c)} type="button"><Eye size={13} /> Details</button>
                {c.outstandingBalance > 0 && <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => openPayment(c)} type="button">Repay</button>}
                <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => { setSelectedCust(c); setWalletOpen(true); setWalletValue(0); }} type="button"><Wallet size={13} /> Wallet</button>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => openCustomerForm(c)} type="button"><Edit2 size={13} /></button>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ color: "var(--danger)" }} onClick={() => void archiveCustomer(c)} type="button"><Archive size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="v2-modal-backdrop">
          <div className="v2-card" style={{ width: 520, maxWidth: "95vw", padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-4">{formMode === "CREATE" ? `Register New ${targetType}` : `Edit ${targetType} Profile`}</h2>
            <form onSubmit={saveCustomer} className="v2-space-y-3">
              <input className="v2-input" placeholder="Full name *" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              <input className="v2-input" placeholder="Phone number *" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} required />
              <input className="v2-input" type="email" placeholder="Email address" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              <input className="v2-input" placeholder="Address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
              <label className="v2-text-xs v2-font-bold v2-text-muted">Credit Limit (Tsh)<input className="v2-input v2-mt-1" type="number" min="0" value={formCreditLimit} onChange={(e) => setFormCreditLimit(Number(e.target.value))} /></label>
              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3"><button className="v2-btn v2-btn-ghost" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="v2-btn v2-btn-primary" type="submit">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {paymentOpen && selectedCust && (
        <div className="v2-modal-backdrop">
          <div className="v2-card" style={{ width: 440, maxWidth: "95vw", padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black">Record Customer Repayment</h2>
            <div className="v2-text-xs v2-text-muted v2-mb-4">{selectedCust.name} · balance {fmtCcy(selectedCust.outstandingBalance)}</div>
            {selectedCust.walletBalance > 0 && <label className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-mb-3"><input type="checkbox" checked={payUsingWallet} onChange={(e) => { setPayUsingWallet(e.target.checked); if (e.target.checked) setPaymentValue(Math.min(selectedCust.outstandingBalance, selectedCust.walletBalance)); }} /> Pay from wallet ({fmtCcy(selectedCust.walletBalance)})</label>}
            <form onSubmit={submitPayment} className="v2-space-y-3"><input className="v2-input" type="number" min="1" max={selectedCust.outstandingBalance} value={paymentValue || ""} onChange={(e) => setPaymentValue(Number(e.target.value))} required /><div className="v2-flex v2-justify-end v2-gap-2"><button className="v2-btn v2-btn-ghost" type="button" onClick={() => setPaymentOpen(false)}>Cancel</button><button className="v2-btn v2-btn-primary" type="submit">Queue Repayment</button></div></form>
          </div>
        </div>
      )}

      {walletOpen && selectedCust && (
        <div className="v2-modal-backdrop">
          <div className="v2-card" style={{ width: 420, maxWidth: "95vw", padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black">Deposit to Customer Wallet</h2>
            <div className="v2-text-xs v2-text-muted v2-mb-4">{selectedCust.name} · wallet {fmtCcy(selectedCust.walletBalance)}</div>
            <form onSubmit={submitWalletDeposit} className="v2-space-y-3"><input className="v2-input" type="number" min="1" value={walletValue || ""} onChange={(e) => setWalletValue(Number(e.target.value))} required /><div className="v2-flex v2-justify-end v2-gap-2"><button className="v2-btn v2-btn-ghost" type="button" onClick={() => setWalletOpen(false)}>Cancel</button><button className="v2-btn v2-btn-primary" type="submit">Queue Deposit</button></div></form>
          </div>
        </div>
      )}

      {contactFormOpen && (
        <div className="v2-modal-backdrop">
          <div className="v2-card" style={{ width: 560, maxWidth: "95vw", padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black">{contactFormMode === "CREATE" ? "Add Customer Contact" : "Edit Customer Contact"}</h2>
            <form onSubmit={saveContact} className="v2-space-y-3 v2-mt-4">
              <select className="v2-input" value={contactCustomerId} onChange={(e) => setContactCustomerId(e.target.value)} disabled={contactFormMode === "EDIT"} required>
                <option value="">Select customer *</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.customerCode || c.id}</option>)}
              </select>
              <div className="v2-grid v2-grid-2 v2-gap-2"><input className="v2-input" placeholder="First name *" value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} required /><input className="v2-input" placeholder="Last name" value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} /></div>
              <input className="v2-input" placeholder="Role / title" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              <div className="v2-grid v2-grid-2 v2-gap-2"><input className="v2-input" placeholder="Phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /><input className="v2-input" type="email" placeholder="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></div>
              <textarea className="v2-input" rows={3} placeholder="Notes" value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} />
              <label className="v2-flex v2-items-center v2-gap-2 v2-text-xs"><input type="checkbox" checked={contactPrimary} onChange={(e) => setContactPrimary(e.target.checked)} /> Primary contact</label>
              <div className="v2-flex v2-justify-end v2-gap-2"><button className="v2-btn v2-btn-ghost" type="button" onClick={() => setContactFormOpen(false)}>Cancel</button><button className="v2-btn v2-btn-primary" type="submit">Save Contact</button></div>
            </form>
          </div>
        </div>
      )}

      {transactionsOpen && customerTransactions && (
        <div className="v2-modal-backdrop">
          <div className="v2-card" style={{ width: 900, maxWidth: "96vw", maxHeight: "85vh", overflow: "auto", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between"><div><h2 className="v2-text-lg v2-font-black">{customerTransactions.customer?.name || selectedCust?.name} — Transactions</h2><div className="v2-text-xs v2-text-muted">Balance {fmtCcy(customerTransactions.customer?.currentBalance ?? selectedCust?.outstandingBalance)} · Wallet {fmtCcy(customerTransactions.customer?.walletBalance ?? selectedCust?.walletBalance)}</div></div><button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setTransactionsOpen(false)} type="button">✕</button></div>
            <h3 className="v2-text-sm v2-font-bold v2-mt-4">Sales</h3>
            <div className="v2-space-y-1">{(customerTransactions.sales || []).map((s: any) => <div key={s.id} className="v2-flex v2-justify-between v2-text-xs v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}><span>{s.saleNumber || s.id}</span><span>{fmtCcy(s.grandTotal)} · {s.status}</span></div>)}</div>
            <h3 className="v2-text-sm v2-font-bold v2-mt-4">Payments</h3>
            <div className="v2-space-y-1">{(customerTransactions.payments || []).map((p: any) => <div key={p.id} className="v2-flex v2-justify-between v2-text-xs v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}><span>{p.paymentNumber || p.id}</span><span>{fmtCcy(p.amount)} · {p.paymentMethod} · {p.status}</span></div>)}</div>
            <h3 className="v2-text-sm v2-font-bold v2-mt-4">Returns</h3>
            <div className="v2-space-y-1">{(customerTransactions.returns || []).map((r: any) => <div key={r.id} className="v2-flex v2-justify-between v2-text-xs v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}><span>{r.returnNumber || r.id}</span><span>{fmtCcy(r.totalRefundAmount)} · {r.refundType}</span></div>)}</div>
          </div>
        </div>
      )}

      {historyOpen && selectedContact && (
        <div className="v2-modal-backdrop">
          <div className="v2-card" style={{ width: 760, maxWidth: "96vw", maxHeight: "85vh", overflow: "auto", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between"><div><h2 className="v2-text-lg v2-font-black">{selectedContact.firstName} {selectedContact.lastName} — History</h2><div className="v2-text-xs v2-text-muted">{selectedContact.roleTitle || "Contact"}</div></div><button className="v2-btn v2-btn-ghost" onClick={() => setHistoryOpen(false)} type="button">✕</button></div>
            <div className="v2-space-y-2 v2-mt-4">{contactHistory.length === 0 ? <div className="v2-empty">No history yet.</div> : contactHistory.map((h: any) => <div key={h.id} className="v2-card" style={{ padding: ".75rem" }}><div className="v2-flex v2-justify-between"><strong className="v2-text-xs">{h.action}</strong><span className="v2-text-xs v2-text-muted">{String(h.createdAt || h.timestamp || "")}</span></div><pre className="v2-text-xs v2-text-muted" style={{ whiteSpace: "pre-wrap", margin: ".4rem 0 0" }}>{JSON.stringify(h.metadata || {}, null, 2)}</pre></div>)}</div>
          </div>
        </div>
      )}

      <div className="v2-text-xs v2-text-muted">
        {showingContacts
          ? "Contacts are tenant/branch scoped, persisted in PostgreSQL, replicated to IndexedDB, and synchronized through the durable outbox."
          : "Customer financial balances are authoritative domain state; local changes remain visibly queued until server synchronization acknowledges them."}
      </div>
    </div>
  );
};
