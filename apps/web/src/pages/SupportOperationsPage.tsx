import React, { useEffect, useState } from "react";

interface Ticket { id: string; subject: string; description: string; status: string; severity: string; category: string; module?: string; ai_summary?: string; created_at: string; }

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body?.error?.message || "Support request failed");
  return body.data;
}

export const SupportOperationsPage: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("P3");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try { const [list, stats] = await Promise.all([api("/api/v1/support/tickets"), api("/api/v1/support/summary")]); setTickets(list || []); setSummary(stats); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load support center"); }
  };
  useEffect(() => { void refresh(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) return setMessage("Please describe the problem.");
    setBusy(true); setMessage("");
    try {
      await api("/api/v1/support/tickets", { method: "POST", body: JSON.stringify({ subject, description, severity }) });
      setSubject(""); setDescription(""); setMessage("Support request created. Running diagnosis is available from the ticket."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create support request"); }
    finally { setBusy(false); }
  };

  const diagnose = async (id: string) => { setBusy(true); try { await api(`/api/v1/support/tickets/${id}/diagnose`, { method: "POST" }); await refresh(); setMessage("Diagnostic analysis completed."); } catch (error) { setMessage(error instanceof Error ? error.message : "Diagnosis failed"); } finally { setBusy(false); } };

  return <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
    <header style={{ marginBottom: 20 }}><h1 style={{ margin: 0 }}>Support & Operations</h1><p style={{ color: "var(--text-muted, #64748b)" }}>Get help, run diagnostics, and track operational issues without losing your business data.</p></header>
    {message && <div role="status" style={{ padding: 12, marginBottom: 16, borderRadius: 10, background: "var(--surface-muted, #f1f5f9)" }}>{message}</div>}
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
      <div className="v2-card" style={{ padding: 16 }}><strong>{tickets.filter(t => t.status !== "RESOLVED").length}</strong><div>Open requests</div></div>
      <div className="v2-card" style={{ padding: 16 }}><strong>{summary?.eventsLast24h ?? 0}</strong><div>Support events / 24h</div></div>
      <div className="v2-card" style={{ padding: 16 }}><strong>Tenant-scoped</strong><div>Diagnostic boundary</div></div>
    </section>
    <section className="v2-card" style={{ padding: 20, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Report a problem</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="What is not working?" />
        <textarea aria-label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happened. Example: sale completed but stock did not update." rows={5} />
        <select aria-label="Severity" value={severity} onChange={e => setSeverity(e.target.value)}><option value="P1">P1 — Business blocked</option><option value="P2">P2 — Major issue</option><option value="P3">P3 — Normal issue</option><option value="P4">P4 — Question/request</option></select>
        <button disabled={busy} type="submit">{busy ? "Submitting…" : "Create Support Request"}</button>
      </form>
    </section>
    <section><h2>My support requests</h2>{tickets.length === 0 ? <div className="v2-card" style={{ padding: 20 }}>No support requests yet.</div> : <div style={{ display: "grid", gap: 12 }}>{tickets.map(ticket => <article key={ticket.id} className="v2-card" style={{ padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>{ticket.subject}</strong><span>{ticket.severity} · {ticket.status}</span></div><p>{ticket.description}</p>{ticket.ai_summary && <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-muted, #f8fafc)" }}><strong>Diagnostic:</strong> {ticket.ai_summary}</div>}<button disabled={busy || ticket.status === "RESOLVED"} onClick={() => void diagnose(ticket.id)} style={{ marginTop: 10 }}>Run Diagnosis</button></article>)}</div>}</section>
  </main>;
};
