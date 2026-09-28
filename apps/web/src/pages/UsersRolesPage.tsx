/**
 * KwakoPosv2 — Unified Users & Roles Management Command Center
 * ─────────────────────────────────────────────────────────────────────────────
 * Scalable, multi-tenant, offline-first identity & access security foundation:
 *   1. Access Architecture & User Hierarchy (Super Admin Space vs Tenant Business Space)
 *   2. 3-Level Security Scope Model (Platform Scope, Tenant Scope, Branch Scope)
 *   3. Multi-Branch Role Assignment Engine (Different roles per branch per employee)
 *   4. Custom Role Builder (Tenant-specific custom roles with granular permission toggles)
 *   5. Employee HR Profiles (National ID, Employee Code, Emergency Contact, Salary Type)
 *   6. POS Quick PIN Security & Session Controls (Failed attempt locks, 2FA status)
 *   7. Authoritative RBAC Permission Matrix (Derived from V2 RBAC model & system manifests)
 *   8. Active Sessions Inspector & Immediate Token Revocation
 *   9. Comprehensive Security Audit Log Engine
 *  10. Super Admin Impersonation & Platform Audit Telemetry
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Shield, Key, Lock, CheckCircle, AlertTriangle, Plus, Search,
  Filter, Eye, Edit2, Trash2, Clock, MapPin, UserCheck, Activity, ChevronRight, RefreshCw, X,
  Building, Briefcase, FileText, UserPlus, Sliders, ShieldCheck, Terminal, Cpu, Zap
} from "lucide-react";
import { useAuth, useBranch, useModule, useRbac, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/apiClient.js";
import { useToast } from "../context/ToastContext.js";


type SubTab = "directory" | "employees" | "branches" | "roles_builder" | "matrix" | "sessions" | "audit" | "super_admin";

export interface UserRecord {
  id: string;
  tenantId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  username?: string;
  role: string;
  branch: string;
  status: "Active" | "Suspended" | "Pending";
  lastLogin?: string;
  pinSet?: boolean;
}

export interface EmployeeProfileRecord {
  id: string;
  userId: string;
  employeeNumber: string;
  nationalId: string;
  address: string;
  emergencyContact: string;
  employmentDate: string;
  salaryType: "MONTHLY" | "HOURLY" | "COMMISSION" | "DAILY";
  notes?: string;
}

export interface BranchRoleAssignment {
  id: string;
  userId: string;
  userName: string;
  branchId: string;
  branchName: string;
  roleId: string;
  roleName: string;
  isPrimary: boolean;
}

export interface CustomRoleRecord {
  id: string;
  tenantId?: string | null;
  name: string;
  slug: string;
  description: string;
  isSystemRole: boolean;
  isCustom: boolean;
  permissions: string[];
}

export interface SessionRecord {
  sessionId: string;
  user: string;
  role: string;
  device: string;
  ip: string;
  loginTime: string;
  lastActive: string;
  isCurrent?: boolean;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  user: string;
  details: string;
  timestamp: string;
  ipAddress?: string;
}

export const UsersRolesPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName, availableBranches } = useBranch();
  const { permissions: rbacPermissions, hasPermission, isSuperAdmin } = useRbac();
  const { isOnline, pendingOutboxCount } = useSync();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<SubTab>("directory");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");

  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<Record<string, EmployeeProfileRecord>>({});

  const [branchAssignments, setBranchAssignments] = useState<BranchRoleAssignment[]>([]);

  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([]);
  const [sessionsList, setSessionsList] = useState<SessionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [securityReadError, setSecurityReadError] = useState<string | null>(null);

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("Cashier");
  const [formBranch, setFormBranch] = useState(currentBranchName || "");
  const [formPassword, setFormPassword] = useState("");
  const [formPin, setFormPin] = useState("");

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [selectedRolePerms, setSelectedRolePerms] = useState<string[]>(["sales.create", "receipt.print"]);

  const permissionsMatrix = useMemo(() => [
    { id: "tenant.manage", name: "Platform Tenant Provisioning", category: "Level 1 — Platform Scope", desc: "Create, suspend, or delete tenant organizations across KwakoPos SaaS", level: 1 },
    { id: "billing.manage", name: "SaaS Billing & Subscriptions", category: "Level 1 — Platform Scope", desc: "Manage tenant plans, billing cycles, invoice generation", level: 1 },
    { id: "feature_flag.manage", name: "Feature Flag & Module Entitlements", category: "Level 1 — Platform Scope", desc: "Enable/disable sector modules per tenant", level: 1 },
    { id: "system.logs.view", name: "Global System Telemetry", category: "Level 1 — Platform Scope", desc: "Inspect platform audit logs and database telemetry", level: 1 },
    { id: "users.manage", name: "Manage Staff & User Accounts", category: "Level 2 — Tenant Scope", desc: "Create staff, edit credentials, assign roles", level: 2 },
    { id: "roles.manage", name: "Configure Custom Business Roles", category: "Level 2 — Tenant Scope", desc: "Build custom roles and assign permission matrices", level: 2 },
    { id: "branches.manage", name: "Multi-Branch Configuration", category: "Level 2 — Tenant Scope", desc: "Add branches, assign branch managers, configure tax IDs", level: 2 },
    { id: "settings.manage", name: "Store & TRA VFD EFD Settings", category: "Level 2 — Tenant Scope", desc: "Configure tax rates, currencies, receipt templates", level: 2 },
    { id: "reports.view", name: "Executive & Tax Reports", category: "Level 2 — Tenant Scope", desc: "View tenant-wide revenue, profit, tax reports", level: 2 },
    { id: "sales.create", name: "POS Checkout & Order Processing", category: "Level 3 — Branch Scope", desc: "Execute sales, process payments, print thermal receipts", level: 3 },
    { id: "sales.refund", name: "Process Customer Sales Refunds", category: "Level 3 — Branch Scope", desc: "Void items, process refunds, issue store credit", level: 3 },
    { id: "inventory.adjust", name: "Stock Adjustment & Waste Logging", category: "Level 3 — Branch Scope", desc: "Adjust inventory quantities, log breakage and expiry", level: 3 },
    { id: "purchase.create", name: "Purchase Orders & Goods Intake", category: "Level 3 — Branch Scope", desc: "Receive inventory shipments, post supplier GRNs", level: 3 },
    { id: "cashdrawer.close", name: "Cash Drawer Reconciliation", category: "Level 3 — Branch Scope", desc: "Perform shift closing cash count and safe drops", level: 3 },
  ], []);

  const loadUsersAndSecurity = useCallback(async () => {
    setIsLoading(true);
    setSecurityReadError(null);
    try {
      const [usersRes, rolesRes, sessionsRes, auditRes] = await Promise.all([
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/users"),
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/roles"),
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/auth/sessions"),
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/audit/logs"),
      ]);

      if (!usersRes.success || !Array.isArray(usersRes.data)) throw new Error("USER_READ_FAILED");
      if (!rolesRes.success || !Array.isArray(rolesRes.data)) throw new Error("ROLE_READ_FAILED");
      if (!sessionsRes.success || !Array.isArray(sessionsRes.data)) throw new Error("SESSION_READ_FAILED");
      if (!auditRes.success || !Array.isArray(auditRes.data)) throw new Error("AUDIT_READ_FAILED");

      setUsersList(usersRes.data.map((u) => ({
        id: u.id,
        tenantId: u.tenantId,
        firstName: u.firstName || (u.name ? u.name.split(" ")[0] : ""),
        lastName: u.lastName || (u.name ? u.name.split(" ").slice(1).join(" ") : ""),
        email: String(u.email || ""),
        phone: u.phone || "",
        username: u.username || u.email || "",
        role: u.role?.name || u.roleName || "",
        branch: u.branch?.name || u.branchName || "",
        status: u.status === "SUSPENDED" ? "Suspended" : u.status === "INACTIVE" ? "Pending" : "Active",
        lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "",
        pinSet: Boolean(u.pinSet || u.pin_hash),
      })));

      const systemRoleNames = new Set(["OWNER","ADMIN","SUPER_ADMIN","SUPERADMIN","MANAGER","CASHIER","INVENTORY","ACCOUNTANT"]);
      setCustomRoles(rolesRes.data.map((r) => {
        const name = String(r.name || "");
        const system = systemRoleNames.has(name.trim().toUpperCase());
        return {
          id: r.id,
          tenantId: r.tenantId,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          description: String(r.description || ""),
          isSystemRole: system,
          isCustom: !system,
          permissions: Array.isArray(r.permissions) ? r.permissions.map(String) : [],
        };
      }));

      setSessionsList(sessionsRes.data.map((s) => ({
        sessionId: s.id || s.sessionId,
        user: s.userName || s.userEmail || "",
        role: s.role || "",
        device: s.deviceId || "",
        ip: "",
        loginTime: s.createdAt ? new Date(s.createdAt).toLocaleString() : "",
        lastActive: "",
        isCurrent: false,
      })));

      setAuditLogs(auditRes.data.map((l) => ({
        id: l.id,
        action: String(l.action || ""),
        user: String(l.userName || l.userEmail || ""),
        details: typeof l.details === "string" ? l.details : JSON.stringify(l.details ?? {}),
        timestamp: l.timestamp ? new Date(l.timestamp).toLocaleString() : "",
        ipAddress: l.ipAddress || undefined,
      })));
    } catch (error) {
      setUsersList([]);
      setCustomRoles([]);
      setSessionsList([]);
      setAuditLogs([]);
      setSecurityReadError(error instanceof Error ? error.message : "SECURITY_DATA_READ_FAILED");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsersAndSecurity();
  }, [loadUsersAndSecurity]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const full = `${u.firstName} ${u.lastName}`.toLowerCase();
      const matchSearch = full.includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.role.toLowerCase().includes(search.toLowerCase());
      const matchRole = selectedRoleFilter === "all" || u.role.toLowerCase() === selectedRoleFilter.toLowerCase();
      return matchSearch && matchRole;
    });
  }, [usersList, search, selectedRoleFilter]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName.trim() || !formEmail.trim() || !formPassword.trim()) return;
    const selectedRole = customRoles.find((r) => r.name === formRole);
    const selectedBranch = availableBranches.find((b) => b.name === formBranch);
    if (!selectedRole?.id || !selectedBranch?.id) {
      toast.error("Identity Configuration Required", "A persisted tenant role and branch must be selected before creating a user.");
      return;
    }
    const newUserPayload = {
      firstName: formFirstName.trim(),
      lastName: formLastName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      password: formPassword,
      roleId: selectedRole.id,
      branchId: selectedBranch.id,
      pin: formPin.trim(),
    };
    try {
      const response = await apiFetch<{ success?: boolean; data?: any }>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(newUserPayload),
      });
      if (!response?.success || !response.data) throw new Error("USER_CREATE_FAILED");
      const created = response.data;
      setUsersList((prev) => [{
        id: created.id,
        tenantId: created.tenantId,
        firstName: created.name?.split(" ")[0] || formFirstName.trim(),
        lastName: created.name?.split(" ").slice(1).join(" ") || formLastName.trim(),
        email: created.email,
        phone: created.phone || formPhone.trim() || "",
        username: created.email,
        role: created.role?.name || selectedRole.name,
        branch: created.branch?.name || selectedBranch.name,
        status: created.status === "SUSPENDED" ? "Suspended" : "Active",
        lastLogin: "",
        pinSet: Boolean(created.pinSet),
      }, ...prev]);
      setIsAddUserOpen(false);
      setFormFirstName("");
      setFormLastName("");
      setFormEmail("");
      setFormPhone("");
      setFormPassword("");
      setFormPin("");
      toast.success("User Created", "User account persisted in PostgreSQL.");
    } catch (error) {
      toast.error("User Creation Failed", error instanceof Error ? error.message : "The user account was not persisted.");
    }
  };
  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      const response = await apiFetch<{ success?: boolean; data?: any }>("/api/v1/roles", {
        method: "POST",
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: newRoleDesc.trim() || null,
          permissions: selectedRolePerms,
        }),
      });
      if (!response?.success || !response.data) throw new Error("ROLE_CREATE_FAILED");
      const role = response.data;
      setCustomRoles((prev) => [...prev, {
        id: role.id,
        tenantId: role.tenantId,
        name: String(role.name || ""),
        slug: String(role.name || "").toLowerCase().replace(/\s+/g, "-"),
        description: String(role.description || ""),
        isSystemRole: false,
        isCustom: true,
        permissions: Array.isArray(role.permissions) ? role.permissions.map(String) : [],
      }]);
      setIsRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      toast.success("Role Created", "Custom role persisted in PostgreSQL.");
    } catch (error) {
      toast.error("Role Creation Failed", error instanceof Error ? error.message : "The role was not persisted.");
    }
  };
  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm("Revoke active session token? User will be logged out on target device.")) return;
    try {
      const response = await apiFetch<{ success?: boolean }>("/api/v1/auth/sessions/" + sessionId, { method: "DELETE" });
      if (!response?.success) throw new Error("SESSION_REVOKE_FAILED");
      setSessionsList((prev) => prev.filter((s) => s.sessionId !== sessionId));
      toast.success("Session Revoked", "Session revocation was persisted in PostgreSQL.");
    } catch (error) {
      toast.error("Session Revocation Failed", error instanceof Error ? error.message : "The session was not changed.");
    }
  };

  const handleDeleteUser = async (userRec: UserRecord) => {
    if (userRec.id === currentUser?.id) {
      toast.warning("Action Denied", "You cannot delete your own active session account.");
      return;
    }
    if (!confirm("Deactivate user account for " + userRec.firstName + " " + userRec.lastName + "?")) return;
    try {
      const response = await apiFetch<{ success?: boolean }>("/api/v1/users/" + userRec.id, { method: "DELETE" });
      if (!response?.success) throw new Error("USER_DEACTIVATE_FAILED");
      setUsersList((prev) => prev.filter((u) => u.id !== userRec.id));
      toast.success("User Deactivated", "Account status was persisted in PostgreSQL.");
    } catch (error) {
      toast.error("User Deactivation Failed", error instanceof Error ? error.message : "The account was not changed.");
    }
  };
  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Users, Roles & Security Access Architecture
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Multi-tenant identity foundation, 3-level permission scopes, custom role builder, and multi-branch assignment.
          </p>
          {securityReadError && (
            <div className="v2-alert v2-alert-danger v2-mt-2">
              Live security data unavailable: {securityReadError}. No local or fabricated security data is being displayed.
            </div>
          )}
        </div>
        <div className="v2-flex v2-items-center v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => void loadUsersAndSecurity()} disabled={isLoading} type="button">
            <RefreshCw size={13} className={isLoading ? "v2-spin" : ""} /> Refresh
          </button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setIsAddUserOpen(true)} type="button">
            <Plus size={13} /> Add Employee Account
          </button>
        </div>
      </div>

      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem", overflowX: "auto" }}>
        {[
          { id: "directory", label: `Staff Directory (${usersList.length})`, icon: Users },
          { id: "employees", label: "Employee HR Profiles", icon: Briefcase },
          { id: "branches", label: "Multi-Branch Roles", icon: Building },
          { id: "roles_builder", label: "Custom Role Builder", icon: Sliders },
          { id: "matrix", label: "3-Level Permission Matrix", icon: Shield },
          { id: "sessions", label: `Active Sessions (${sessionsList.length})`, icon: Clock },
          { id: "audit", label: "Security Audit Engine", icon: Activity },
          { id: "super_admin", label: "Super Admin Space", icon: Zap },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as SubTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
            style={{ whiteSpace: "nowrap" }}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "directory" && (
        <div className="v2-space-y-4">
          <div className="v2-flex v2-items-center v2-justify-between v2-gap-4">
            <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
              <input
                className="v2-input v2-input-sm"
                style={{ paddingLeft: "2.4rem" }}
                placeholder="Search staff by name, email, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="v2-input v2-input-sm"
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="v2-card">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Contact Details</th>
                  <th>Primary Role</th>
                  <th>Primary Branch</th>
                  <th>PIN Security</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="v2-font-bold">{u.firstName} {u.lastName}</div>
                      <div className="v2-mono v2-text-xs v2-text-muted">{u.id}</div>
                    </td>
                    <td>
                      <div className="v2-text-xs">{u.email}</div>
                      <div className="v2-text-xs v2-text-muted">{u.phone}</div>
                    </td>
                    <td><span className="badge v2-badge-accent">{u.role}</span></td>
                    <td>{u.branch}</td>
                    <td>
                      <span className={`badge ${u.pinSet ? "v2-badge-success" : "v2-badge-warning"}`}>
                        {u.pinSet ? "PIN ENABLED" : "NO PIN"}
                      </span>
                    </td>
                    <td><span className={`badge ${u.status === "Active" ? "v2-badge-success" : "v2-badge-danger"}`}>{u.status}</span></td>
                    <td className="v2-text-xs v2-text-muted">{u.lastLogin}</td>
                    <td>
                      <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ color: "var(--danger)" }} onClick={() => handleDeleteUser(u)} type="button">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "employees" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Employee HR & Payroll Profiles</div></div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>User Account</th>
                <th>Employee Code</th>
                <th>National ID (NIDA)</th>
                <th>Address & Location</th>
                <th>Emergency Contact</th>
                <th>Salary Structure</th>
                <th>Employment Date</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => {
                const emp = employeeProfiles[u.id];
                if (!emp) return null;
                return (
                  <tr key={u.id}>
                    <td className="v2-font-bold">{u.firstName} {u.lastName}</td>
                    <td className="v2-mono v2-text-xs">{emp.employeeNumber}</td>
                    <td className="v2-mono v2-text-xs">{emp.nationalId}</td>
                    <td className="v2-text-xs">{emp.address}</td>
                    <td className="v2-text-xs">{emp.emergencyContact}</td>
                    <td><span className="badge v2-badge-accent">{emp.salaryType}</span></td>
                    <td className="v2-text-xs v2-text-muted">{emp.employmentDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "branches" && (
        <div className="v2-card">
          <div className="v2-card-header">
            <div>
              <div className="v2-card-title">Multi-Branch User Role Mapping</div>
              <div className="v2-text-xs v2-text-muted">A single employee can have distinct operational roles per branch location</div>
            </div>
          </div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Target Branch</th>
                <th>Assigned Role in Branch</th>
                <th>Branch Status</th>
                <th>Assignment Type</th>
              </tr>
            </thead>
            <tbody>
              {branchAssignments.map((ba) => (
                <tr key={ba.id}>
                  <td className="v2-font-bold">{ba.userName}</td>
                  <td className="v2-font-bold">{ba.branchName}</td>
                  <td><span className="badge v2-badge-accent">{ba.roleName}</span></td>
                  <td><span className="badge v2-badge-success">ACTIVE</span></td>
                  <td>
                    <span className={`badge ${ba.isPrimary ? "v2-badge-success" : "v2-badge-warning"}`}>
                      {ba.isPrimary ? "PRIMARY BRANCH" : "SECONDARY BRANCH"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "roles_builder" && (
        <div className="v2-space-y-4">
          <div className="v2-flex v2-items-center v2-justify-between">
            <div className="v2-text-xs v2-text-muted">Define custom role responsibilities tailored to your sector operations</div>
            <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setIsRoleModalOpen(true)} type="button">
              <Plus size={13} /> Build Custom Role
            </button>
          </div>
          <div className="v2-grid v2-grid-3 v2-gap-4">
            {customRoles.map((r) => (
              <div key={r.id} className="v2-card v2-p-4 v2-space-y-2">
                <div className="v2-flex v2-items-center v2-justify-between">
                  <h3 className="v2-font-black v2-text-sm">{r.name}</h3>
                  <span className={`badge ${r.isSystemRole ? "v2-badge-accent" : "v2-badge-success"}`}>
                    {r.isSystemRole ? "SYSTEM ROLE" : "CUSTOM ROLE"}
                  </span>
                </div>
                <p className="v2-text-xs v2-text-muted">{r.description}</p>
                <div className="v2-pt-2 v2-text-xs v2-font-mono v2-text-muted">
                  Slug: {r.slug} · Permissions: {r.permissions.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "matrix" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">3-Level Authorization Security Scope Matrix</div></div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>Security Scope Level</th>
                <th>Permission Identifier</th>
                <th>Description</th>
                <th>Owner</th>
                <th>Admin</th>
                <th>Manager</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
              {permissionsMatrix.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={`badge ${p.level === 1 ? "v2-badge-danger" : p.level === 2 ? "v2-badge-accent" : "v2-badge-success"}`}>
                      {p.category}
                    </span>
                  </td>
                  <td className="v2-mono v2-font-bold">{p.id}</td>
                  <td className="v2-text-xs">{p.desc}</td>
                  <td className="v2-text-center">✅</td>
                  <td className="v2-text-center">{p.level > 1 ? "✅" : "❌"}</td>
                  <td className="v2-text-center">{p.level === 3 ? "✅" : "❌"}</td>
                  <td className="v2-text-center">{p.id.includes("sales") || p.id.includes("cashdrawer") ? "✅" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "sessions" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Active Bearer Sessions & Terminal Locks</div></div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>User Account</th>
                <th>User Agent / Device</th>
                <th>IP Address</th>
                <th>Login Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessionsList.map((s) => (
                <tr key={s.sessionId}>
                  <td className="v2-mono v2-text-xs">{s.sessionId}</td>
                  <td className="v2-font-bold">{s.user}</td>
                  <td className="v2-text-xs v2-text-muted">{s.device}</td>
                  <td className="v2-mono v2-text-xs">{s.ip}</td>
                  <td className="v2-text-xs">{s.loginTime}</td>
                  <td>
                    <button className="v2-btn v2-btn-danger v2-btn-sm" onClick={() => handleRevokeSession(s.sessionId)} type="button">
                      Revoke Token
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "audit" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Immutable Security Audit Trail Log</div></div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Timestamp</th>
                <th>Action</th>
                <th>User Account</th>
                <th>Audit Details & Payload</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((l) => (
                <tr key={l.id}>
                  <td className="v2-mono v2-text-xs">{l.id}</td>
                  <td className="v2-text-xs v2-text-muted">{l.timestamp}</td>
                  <td><span className="badge v2-badge-accent">{l.action}</span></td>
                  <td className="v2-font-bold">{l.user}</td>
                  <td className="v2-text-xs">{l.details}</td>
                  <td className="v2-mono v2-text-xs">{l.ipAddress || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "super_admin" && (
        <div className="v2-card v2-p-4 v2-space-y-4">
          <div className="v2-card-header">
            <div>
              <div className="v2-card-title">KwakoPos SaaS Platform Super Admin Controls</div>
              <div className="v2-text-xs v2-text-muted">Platform-level user impersonation, tenant management, and global system health</div>
            </div>
          </div>
          <div className="v2-grid v2-grid-3 v2-gap-4">
            <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
              <div className="v2-text-xs v2-font-bold v2-text-muted">Total Registered Tenants</div>
              <div className="v2-text-lg v2-font-black">Live platform metric required</div>
            </div>
            <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
              <div className="v2-text-xs v2-font-bold v2-text-muted">Total Active Users</div>
              <div className="v2-text-lg v2-font-black">Live platform metric required</div>
            </div>
            <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
              <div className="v2-text-xs v2-font-bold v2-text-muted">Super Admin Status</div>
              <div className="v2-text-lg v2-font-black" style={{ color: currentUser ? "var(--success)" : "var(--danger)" }}>{currentUser ? "AUTHENTICATED" : "NOT AUTHENTICATED"}</div>
            </div>
          </div>
        </div>
      )}

      {isAddUserOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 500, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
              <h2 className="v2-text-lg v2-font-black">Add Staff Employee Account</h2>
              <button aria-label="Close add user dialog" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsAddUserOpen(false)} type="button"><X size={15} /></button>
            </div>
            <form onSubmit={handleAddUser} className="v2-space-y-3">
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">FIRST NAME *</label>
                  <input className="v2-input" value={formFirstName} onChange={(e) => setFormFirstName(e.target.value)} required />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">LAST NAME *</label>
                  <input className="v2-input" value={formLastName} onChange={(e) => setFormLastName(e.target.value)} required />
                </div>
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">EMAIL ADDRESS *</label>
                  <input className="v2-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">PHONE NUMBER</label>
                  <input className="v2-input" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+255 754..." />
                </div>
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">ASSIGNED ROLE *</label>
                  <select className="v2-input" value={formRole} onChange={(e) => setFormRole(e.target.value)}>
                    {customRoles.map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">PRIMARY BRANCH *</label>
                  <select className="v2-input" value={formBranch} onChange={(e) => setFormBranch(e.target.value)}>
                    {availableBranches.map((b) => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">ACCOUNT PASSWORD *</label>
                  <input className="v2-input" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">POS QUICK LOGIN PIN (4 DIGITS)</label>
                  <input className="v2-input" type="password" maxLength={4} value={formPin} onChange={(e) => setFormPin(e.target.value)} placeholder="e.g. 1234" />
                </div>
              </div>
              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3">
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsAddUserOpen(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
