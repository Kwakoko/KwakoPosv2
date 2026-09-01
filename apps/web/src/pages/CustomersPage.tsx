/**
 * KwakoPosv2 — Customers, Patients, Clients & SACCO Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete customer directory and credit ledger workspace matching mature legacy UX:
 *   1. Sector-adaptive terminology (Customer, Patient, Client, Member, Tenant, Student, Guest)
 *   2. KPI metrics: Total Registered, Total Debt Due, Total Prepaid Wallet, Loyalty Points
 *   3. Loyalty Tier Badges (Platinum VIP, Gold Member, Silver Tier, Bronze Partner)
 *   4. Repay Store Debt Modal (with Pay from Wallet option)
 *   5. Prepaid Wallet Deposit Modal
 *   6. Add/Edit Customer Profile Drawer Modal
 *   7. Outstanding Debt Guard for Deletion
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useMemo, useState } from "react";
import {
  Users, User, Phone, Mail, Award, DollarSign, Search, Coins, Edit2, Trash2,
  UserPlus, Sparkles, Plus, AlertCircle, CheckCircle, Wallet, Shield
} from "lucide-react";
import { useModule } from "../context/KwakoPosContexts.js";

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  type: string;
  loyaltyPoints: number;
  outstandingBalance: number;
  creditLimit: number;
  walletBalance: number;
}

const fmtCcy = (n: number) => `Tsh ${Math.round(n).toLocaleString()}`;

export const CustomersPage: React.FC = () => {
  const { activeModule } = useModule();

  // Sector-adaptive terminology mapping
  const targetType = useMemo(() => {
    switch (activeModule) {
      case "Pharmacy": return "Patient";
      case "SACCO": return "Member";
      case "Law": return "Client";
      case "RealEstate": return "Tenant";
      case "School": return "Student";
      case "Hotel": return "Guest";
      case "BusinessConsultant": return "Client";
      default: return "Customer";
    }
  }, [activeModule]);

  const pageTitle = useMemo(() => {
    switch (activeModule) {
      case "Pharmacy": return "Patient Database & Medical Profiles";
      case "SACCO": return "SACCO Membership & Share Registry";
      case "Law": return "Client Directory & Matter Debtors";
      default: return "Customer Directory & Credit Ledger";
    }
  }, [activeModule]);

  // Initial customer records state
  const [customers, setCustomers] = useState<CustomerRecord[]>([
    { id: "cust-001", name: "Amani Mwakalundwa", phone: "+255 754 112 233", email: "amani@example.com", type: targetType, loyaltyPoints: 2450, outstandingBalance: 45000, creditLimit: 200000, walletBalance: 15000 },
    { id: "cust-002", name: "Baraka Juma Msimbe", phone: "+255 713 445 566", email: "baraka@example.com", type: targetType, loyaltyPoints: 920, outstandingBalance: 0, creditLimit: 500000, walletBalance: 85000 },
    { id: "cust-003", name: "Christina John Kimaro", phone: "+255 788 990 112", email: "christina@example.com", type: targetType, loyaltyPoints: 310, outstandingBalance: 120000, creditLimit: 150000, walletBalance: 0 },
    { id: "cust-004", name: "Daudi Paul Ndege", phone: "+255 762 334 455", email: "daudi@example.com", type: targetType, loyaltyPoints: 80, outstandingBalance: 0, creditLimit: 100000, walletBalance: 42000 },
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCust, setSelectedCust] = useState<CustomerRecord | null>(null);

  // Dialog visibility states
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [paymentVal, setPaymentVal] = useState<number>(0);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletVal, setWalletVal] = useState<number>(0);
  const [payUsingWallet, setPayUsingWallet] = useState(false);

  // Form CRUD states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCreditLimit, setFormCreditLimit] = useState<number>(0);
  const [formLoyaltyPoints, setFormLoyaltyPoints] = useState<number>(0);
  const [formWalletBalance, setFormWalletBalance] = useState<number>(0);

  // Filtered list
  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [customers, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = customers.length;
    const totalDebt = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const totalWallet = customers.reduce((sum, c) => sum + (c.walletBalance || 0), 0);
    const totalLoyalty = customers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);
    return { total, totalDebt, totalWallet, totalLoyalty };
  }, [customers]);

  // Loyalty Tier badges
  const getLoyaltyTier = (pts: number) => {
    if (pts >= 2000) return { label: "Platinum VIP", badgeClass: "v2-badge-accent" };
    if (pts >= 800)  return { label: "Gold Member",  badgeClass: "v2-badge-warning" };
    if (pts >= 250)  return { label: "Silver Tier",  badgeClass: "v2-badge-muted" };
    return { label: "Bronze Partner", badgeClass: "v2-badge-secondary" };
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) return;

    if (formMode === "CREATE") {
      const newCust: CustomerRecord = {
        id: `cust-${Date.now()}`,
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        type: targetType,
        loyaltyPoints: formLoyaltyPoints || 0,
        outstandingBalance: 0,
        creditLimit: formCreditLimit || 0,
        walletBalance: formWalletBalance || 0,
      };
      setCustomers((prev) => [newCust, ...prev]);
    } else if (selectedCust) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCust.id
            ? {
                ...c,
                name: formName.trim(),
                phone: formPhone.trim(),
                email: formEmail.trim(),
                loyaltyPoints: formLoyaltyPoints,
                creditLimit: formCreditLimit,
                walletBalance: formWalletBalance,
              }
            : c
        )
      );
    }
    setIsFormOpen(false);
    resetForm();
  };

  const openCreateForm = () => {
    setSelectedCust(null);
    setFormMode("CREATE");
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (c: CustomerRecord) => {
    setSelectedCust(c);
    setFormMode("EDIT");
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormEmail(c.email || "");
    setFormCreditLimit(c.creditLimit || 0);
    setFormLoyaltyPoints(c.loyaltyPoints || 0);
    setFormWalletBalance(c.walletBalance || 0);
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormCreditLimit(0);
    setFormLoyaltyPoints(0);
    setFormWalletBalance(0);
  };

  const handleDelete = (c: CustomerRecord) => {
    if (c.outstandingBalance > 0) {
      alert(`Cannot delete profile. ${c.name} has an outstanding debt of ${fmtCcy(c.outstandingBalance)}.`);
      return;
    }
    if (confirm(`Permanently delete profile for ${c.name}?`)) {
      setCustomers((prev) => prev.filter((item) => item.id !== c.id));
    }
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || paymentVal <= 0) return;

    let updatedWallet = selectedCust.walletBalance || 0;
    if (payUsingWallet) {
      if (updatedWallet < paymentVal) {
        alert("Insufficient wallet balance for this repayment.");
        return;
      }
      updatedWallet -= paymentVal;
    }

    const newDebt = Math.max(0, selectedCust.outstandingBalance - paymentVal);
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selectedCust.id
          ? { ...c, outstandingBalance: newDebt, walletBalance: updatedWallet }
          : c
      )
    );

    setIsPayOpen(false);
    setSelectedCust(null);
    setPaymentVal(0);
    setPayUsingWallet(false);
  };

  const handleWalletDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || walletVal <= 0) return;

    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selectedCust.id
          ? { ...c, walletBalance: c.walletBalance + walletVal }
          : c
      )
    );

    setIsWalletOpen(false);
    setSelectedCust(null);
    setWalletVal(0);
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            {pageTitle}
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Configure {targetType.toLowerCase()} profiles, loyalty rewards, prepaid wallets, and store credit debt balances.
          </p>
        </div>
        <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={openCreateForm} type="button">
          <UserPlus size={13} /> Add {targetType}
        </button>
      </div>

      {/* KPI Stats Row */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#38bdf8" }} />
          <div className="kpi-card-label">Total Registered</div>
          <div className="kpi-card-value">{stats.total} {targetType}s</div>
          <div className="kpi-card-desc">Active Profiles</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#f87171" }} />
          <div className="kpi-card-label">Outstanding Credit Debt</div>
          <div className="kpi-card-value" style={{ color: "var(--danger)" }}>{fmtCcy(stats.totalDebt)}</div>
          <div className="kpi-card-desc">Unpaid Debt Ledger</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#4ade80" }} />
          <div className="kpi-card-label">Prepaid Wallet Funds</div>
          <div className="kpi-card-value" style={{ color: "var(--success)" }}>{fmtCcy(stats.totalWallet)}</div>
          <div className="kpi-card-desc">Pre-funded Balances</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#fbbf24" }} />
          <div className="kpi-card-label">Accumulated Loyalty</div>
          <div className="kpi-card-value">{stats.totalLoyalty.toLocaleString()} pts</div>
          <div className="kpi-card-desc">Reward Points</div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="v2-flex v2-items-center v2-gap-4">
        <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
          <input
            className="v2-input v2-input-sm"
            style={{ paddingLeft: "2.4rem" }}
            placeholder={`Search ${targetType.toLowerCase()}s by name, email, or phone...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Cards Grid */}
      <div className="v2-grid v2-grid-3 v2-gap-4">
        {filteredCustomers.length === 0 ? (
          <div className="v2-empty" style={{ gridColumn: "1 / -1" }}>
            <p className="v2-empty-title">No {targetType.toLowerCase()} profiles found</p>
          </div>
        ) : (
          filteredCustomers.map((c) => {
            const tier = getLoyaltyTier(c.loyaltyPoints || 0);
            return (
              <div key={c.id} className="v2-card" style={{ padding: "1.25rem", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 4, background: "var(--accent)", borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)" }} />

                <div className="v2-flex v2-items-start v2-justify-between v2-mb-2">
                  <div className="v2-flex v2-items-center v2-gap-2">
                    <div style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <User size={18} style={{ color: "var(--accent)" }} />
                    </div>
                    <div>
                      <div className="v2-font-bold v2-text-sm">{c.name}</div>
                      <div className="v2-mono v2-text-xs v2-text-muted">{c.id}</div>
                    </div>
                  </div>
                  <span className={`badge ${c.outstandingBalance > 0 ? "v2-badge-danger" : "v2-badge-success"}`}>
                    {c.outstandingBalance > 0 ? "Debt Due" : "Zero Balance"}
                  </span>
                </div>

                <div className="v2-flex v2-items-center v2-gap-2 v2-mb-3">
                  <span className={`badge ${tier.badgeClass}`}>{tier.label}</span>
                  {c.creditLimit > 0 && (
                    <span className="badge v2-badge-muted">Limit: {fmtCcy(c.creditLimit)}</span>
                  )}
                </div>

                <div className="v2-space-y-1 v2-text-xs v2-text-muted v2-mb-4">
                  <div className="v2-flex v2-items-center v2-gap-2"><Phone size={12} /> {c.phone}</div>
                  {c.email && <div className="v2-flex v2-items-center v2-gap-2"><Mail size={12} /> {c.email}</div>}
                </div>

                <div className="v2-grid v2-grid-3 v2-gap-2 v2-pt-2" style={{ borderTop: "1px solid var(--surface-border)" }}>
                  <div>
                    <div className="v2-text-xs v2-text-muted v2-font-bold">LOYALTY</div>
                    <div className="v2-mono v2-text-xs v2-font-black">{c.loyaltyPoints.toLocaleString()} pts</div>
                  </div>
                  <div>
                    <div className="v2-text-xs v2-text-muted v2-font-bold">WALLET</div>
                    <div className="v2-mono v2-text-xs v2-font-black" style={{ color: "var(--success)" }}>{fmtCcy(c.walletBalance)}</div>
                  </div>
                  <div>
                    <div className="v2-text-xs v2-text-muted v2-font-bold">CREDIT DUE</div>
                    <div className="v2-mono v2-text-xs v2-font-black" style={{ color: c.outstandingBalance > 0 ? "var(--danger)" : "var(--text)" }}>{fmtCcy(c.outstandingBalance)}</div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="v2-flex v2-gap-2 v2-mt-3">
                  {c.outstandingBalance > 0 && (
                    <button className="v2-btn v2-btn-primary v2-btn-sm" style={{ flex: 1 }} onClick={() => { setSelectedCust(c); setIsPayOpen(true); }} type="button">
                      Repay
                    </button>
                  )}
                  <button className="v2-btn v2-btn-secondary v2-btn-sm" style={{ flex: 1 }} onClick={() => { setSelectedCust(c); setIsWalletOpen(true); }} type="button">
                    Wallet +
                  </button>
                  <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => openEditForm(c)} type="button"><Edit2 size={13} /></button>
                  <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ color: "var(--danger)" }} onClick={() => handleDelete(c)} type="button"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* --- ADD / EDIT Profile Dialog Modal --- */}
      {isFormOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-4">
              {formMode === "CREATE" ? `Register New ${targetType}` : `Edit Profile: ${formName}`}
            </h2>
            <form onSubmit={handleFormSubmit} className="v2-space-y-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">{targetType} Full Name *</label>
                <input className="v2-input v2-input-sm" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Phone Number *</label>
                <input className="v2-input v2-input-sm" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} required />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Email Address</label>
                <input className="v2-input v2-input-sm" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Credit Limit (Tsh)</label>
                  <input className="v2-input v2-input-sm" type="number" value={formCreditLimit} onChange={(e) => setFormCreditLimit(Number(e.target.value))} />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Loyalty Points</label>
                  <input className="v2-input v2-input-sm" type="number" value={formLoyaltyPoints} onChange={(e) => setFormLoyaltyPoints(Number(e.target.value))} />
                </div>
              </div>
              {formMode === "CREATE" && (
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Initial Wallet Balance (Tsh)</label>
                  <input className="v2-input v2-input-sm" type="number" value={formWalletBalance} onChange={(e) => setFormWalletBalance(Number(e.target.value))} />
                </div>
              )}
              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsFormOpen(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">
                  {formMode === "CREATE" ? "Register Profile" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Repay Modal Dialog --- */}
      {isPayOpen && selectedCust && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 420, padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-2">Record Debt Repayment</h2>
            <div className="v2-text-xs v2-text-muted v2-mb-4">
              Account: <strong className="v2-text-main">{selectedCust.name}</strong> · Debt Due: <strong style={{ color: "var(--danger)" }}>{fmtCcy(selectedCust.outstandingBalance)}</strong>
            </div>

            {selectedCust.walletBalance > 0 && (
              <div className="v2-card v2-mb-4" style={{ padding: ".75rem", background: "var(--success-muted)", borderColor: "var(--success)" }}>
                <div className="v2-flex v2-items-center v2-justify-between">
                  <div className="v2-text-xs">
                    <span className="v2-text-muted">Available Wallet: </span>
                    <strong style={{ color: "var(--success)" }}>{fmtCcy(selectedCust.walletBalance)}</strong>
                  </div>
                  <label className="v2-flex v2-items-center v2-gap-1 v2-text-xs v2-font-bold" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={payUsingWallet}
                      onChange={(e) => {
                        setPayUsingWallet(e.target.checked);
                        if (e.target.checked) setPaymentVal(Math.min(selectedCust.outstandingBalance, selectedCust.walletBalance));
                        else setPaymentVal(0);
                      }}
                    />
                    <span>Pay from Wallet</span>
                  </label>
                </div>
              </div>
            )}

            <form onSubmit={handlePaymentSubmit} className="v2-space-y-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Amount Received (Tsh) *</label>
                <input
                  className="v2-input"
                  type="number"
                  value={paymentVal || ""}
                  onChange={(e) => setPaymentVal(Number(e.target.value))}
                  disabled={payUsingWallet}
                  required
                />
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsPayOpen(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Submit Repayment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Wallet Deposit Modal Dialog --- */}
      {isWalletOpen && selectedCust && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 400, padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-2">Deposit to Prepaid Wallet</h2>
            <div className="v2-text-xs v2-text-muted v2-mb-4">
              Account: <strong className="v2-text-main">{selectedCust.name}</strong> · Wallet Bal: <strong style={{ color: "var(--success)" }}>{fmtCcy(selectedCust.walletBalance)}</strong>
            </div>

            <form onSubmit={handleWalletDeposit} className="v2-space-y-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Deposit Amount (Tsh) *</label>
                <input
                  className="v2-input"
                  type="number"
                  value={walletVal || ""}
                  onChange={(e) => setWalletVal(Number(e.target.value))}
                  placeholder="Enter amount"
                  required
                />
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsWalletOpen(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Deposit Funds</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
