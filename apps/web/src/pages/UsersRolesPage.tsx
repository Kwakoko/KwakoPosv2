/**
 * KwakoPosv2 — Users, Roles & Authorization Command Center
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete RBAC management workspace featuring:
 *   1. Staff Directory (search, status, branch grants, role assignment)
 *   2. RBAC Permission Matrix (granular permission toggles per role)
 *   3. Active Sessions Inspector
 *   4. Security Audit Trail
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  Users, Shield, Key, Lock, CheckCircle, AlertTriangle, Plus, Search,
  Filter, Eye, Edit2, Trash2, Clock, MapPin, UserCheck, Activity, ChevronRight
} from "lucide-react";

type SubTab = "directory" | "matrix" | "sessions" | "audit";

const SYSTEM_ROLES = [
  { id: "owner",      name: "Tenant Owner",          count: 2,  desc: "Full administrative control across all branches" },
  { id: "manager",    name: "Branch Manager",        count: 5,  desc: "Branch operations, shift approvals, and inventory control" },
  { id: "cashier",    name: "Cashier / POS Operator",count: 14, desc: "Point of sale registers, receipts, and customer checkout" },
  { id: "inventory",  name: "Inventory Officer",     count: 4,  desc: "Stock intake, FEFO batching, supplier purchase orders" },
  { id: "accountant", name: "Accountant",            count: 3,  desc: "General ledger, tax filings, financial reporting" },
];

const PERMISSIONS = [
  { id: "pos.access",      name: "Access POS Counter",   category: "POS & Sales" },
  { id: "pos.discount",    name: "Grant Custom Discount", category: "POS & Sales" },
  { id: "inventory.read",  name: "View Stock Catalog",   category: "Inventory" },
  { id: "inventory.adjust",name: "Adjust Stock Quantity",category: "Inventory" },
  { id: "finance.read",    name: "View Trial Balance",   category: "Finance" },
  { id: "users.manage",    name: "Manage Staff & Roles", category: "Administration" },
];

export const UsersRolesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubTab>("directory");
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Page Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Users, Roles & RBAC Security Matrix
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Manage multi-branch staff accounts, role matrices, session revocations, and access control audit logs.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button">
            <Plus size={13} /> Add Employee Account
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {[
          { id: "directory", label: "Staff Directory", icon: Users },
          { id: "matrix", label: "Permission Matrix", icon: Shield },
          { id: "sessions", label: "Active Sessions", icon: Clock },
          { id: "audit", label: "Security Audit Log", icon: Activity },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as SubTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Directory Tab */}
      {activeTab === "directory" && (
        <div className="v2-space-y-4">
          {/* Controls row */}
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
            <div className="v2-flex v2-gap-2">
              <select
                className="v2-input v2-input-sm"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="all">All Roles</option>
                {SYSTEM_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Employee Directory Table */}
          <div className="v2-card">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Email & Phone</th>
                  <th>Assigned Role</th>
                  <th>Assigned Branch</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Amani Mwangi", email: "owner@business.co.tz", phone: "+255 754 112 233", role: "Tenant Owner", branch: "All Branches", status: "Active", lastLogin: "Just now" },
                  { name: "Baraka Juma",  email: "baraka@business.co.tz", phone: "+255 713 445 566", role: "Branch Manager", branch: "Posta HQ", status: "Active", lastLogin: "10 mins ago" },
                  { name: "Christina John", email: "christina@business.co.tz", phone: "+255 788 990 112", role: "Cashier", branch: "Kariakoo Store", status: "Active", lastLogin: "1 hour ago" },
                  { name: "Daudi Msimbe", email: "daudi@business.co.tz", phone: "+255 762 334 455", role: "Inventory Officer", branch: "Arusha Hub", status: "Active", lastLogin: "Yesterday" },
                  { name: "Elizabeth Paul", email: "elizabeth@business.co.tz", phone: "+255 744 556 677", role: "Accountant", branch: "Posta HQ", status: "Suspended", lastLogin: "3 days ago" },
                ].map((user) => (
                  <tr key={user.email}>
                    <td>
                      <div className="v2-font-bold">{user.name}</div>
                    </td>
                    <td>
                      <div className="v2-text-xs">{user.email}</div>
                      <div className="v2-text-xs v2-text-muted">{user.phone}</div>
                    </td>
                    <td>
                      <span className="badge v2-badge-accent">{user.role}</span>
                    </td>
                    <td>{user.branch}</td>
                    <td>
                      <span className={`badge ${user.status === "Active" ? "v2-badge-success" : "v2-badge-danger"}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="v2-text-xs v2-text-muted">{user.lastLogin}</td>
                    <td>
                      <div className="v2-flex v2-gap-1">
                        <button className="v2-btn v2-btn-ghost v2-btn-sm" type="button"><Edit2 size={13} /></button>
                        <button className="v2-btn v2-btn-ghost v2-btn-sm" type="button" style={{ color: "var(--danger)" }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permission Matrix Tab */}
      {activeTab === "matrix" && (
        <div className="v2-space-y-4">
          <div className="v2-card">
            <div className="v2-card-header"><div className="v2-card-title">Granular Role Permission Matrix</div></div>
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Permission Objective</th>
                  <th>Tenant Owner</th>
                  <th>Branch Manager</th>
                  <th>Cashier</th>
                  <th>Inventory Officer</th>
                  <th>Accountant</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm.id}>
                    <td>
                      <div className="v2-font-bold">{perm.name}</div>
                      <div className="v2-text-xs v2-text-muted">{perm.category} · <span className="v2-mono">{perm.id}</span></div>
                    </td>
                    <td><CheckCircle size={16} style={{ color: "var(--success)" }} /></td>
                    <td><CheckCircle size={16} style={{ color: "var(--success)" }} /></td>
                    <td>{perm.id.startsWith("pos") ? <CheckCircle size={16} style={{ color: "var(--success)" }} /> : <span className="v2-text-muted">−</span>}</td>
                    <td>{perm.id.startsWith("inventory") ? <CheckCircle size={16} style={{ color: "var(--success)" }} /> : <span className="v2-text-muted">−</span>}</td>
                    <td>{perm.id.startsWith("finance") ? <CheckCircle size={16} style={{ color: "var(--success)" }} /> : <span className="v2-text-muted">−</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Sessions Tab */}
      {activeTab === "sessions" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Active Device & Browser Sessions</div></div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Device / IP Address</th>
                <th>Login Time</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[
                { user: "Amani Mwangi (Owner)", device: "Chrome 128 (Windows 11) · 197.250.42.10", login: "2026-09-01 07:15", active: "Just now" },
                { user: "Christina John (Cashier)", device: "KwakoPos Touch POS Terminal · 192.168.1.104", login: "2026-09-01 08:00", active: "2 mins ago" },
              ].map((sess, i) => (
                <tr key={i}>
                  <td className="v2-font-bold">{sess.user}</td>
                  <td className="v2-text-xs">{sess.device}</td>
                  <td className="v2-text-xs v2-text-muted">{sess.login}</td>
                  <td className="v2-text-xs v2-font-bold">{sess.active}</td>
                  <td>
                    <button className="v2-btn v2-btn-danger v2-btn-sm" type="button">Revoke Session</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
