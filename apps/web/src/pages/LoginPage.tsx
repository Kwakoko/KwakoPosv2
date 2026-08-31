import React, { useState } from "react";
import { login } from "../services/apiClient.js";

export const LoginPage: React.FC<{ onAuthenticated: () => void }> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <form onSubmit={submit} className="workspace-card" style={{ width: "100%", maxWidth: 420 }}>
        <div className="workspace-title">Sign in to KwakoPos</div>
        <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
          Authenticate against the KwakoPosv2 API before tenant, branch, permissions and workspaces are loaded.
        </p>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          <span style={{ display: "block", marginBottom: "0.35rem" }}>Email</span>
          <input className="search-input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          <span style={{ display: "block", marginBottom: "0.35rem" }}>Password</span>
          <input className="search-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <div className="workspace-card" style={{ borderColor: "var(--danger)", marginBottom: "1rem" }}>{error}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
};
