import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  KeyRound,
  Smartphone,
  Check,
  Copy,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  Lock,
} from "lucide-react";
import {
  startSuperAdminSetup,
  completeSuperAdminSetup,
  SuperAdminSetupDetails,
} from "../services/applicationApiService.js";

interface SuperAdminSetupModalProps {
  isOpen: boolean;
  setupToken: string;
  onSuccess: (credentials?: {
    email: string;
    newPassword: string;
    totpCode: string;
  }) => void;
  onCancel?: () => void;
}

export const SuperAdminSetupModal: React.FC<SuperAdminSetupModalProps> = ({
  isOpen,
  setupToken,
  onSuccess,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);
  const [setupDetails, setSetupDetails] = useState<SuperAdminSetupDetails | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Form fields
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen || !setupToken) return;
    setLoading(true);
    setInitError(null);
    setSubmitError(null);
    setIsSuccess(false);

    startSuperAdminSetup(setupToken)
      .then((data) => {
        setSetupDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        setInitError(
          err instanceof Error ? err.message : "Failed to load security setup details"
        );
        setLoading(false);
      });
  }, [isOpen, setupToken]);

  if (!isOpen) return null;

  // Password requirements validation
  const hasMinLength = newPassword.length >= 10;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isPasswordValid =
    hasMinLength && hasUpper && hasLower && hasDigit && hasSpecial && passwordsMatch;
  const isTotpValid = /^\d{6}$/.test(totpCode.trim());

  const formatSecret = (secret?: string) => {
    if (!secret) return "";
    return secret.match(/.{1,4}/g)?.join(" ") || secret;
  };

  const handleCopySecret = async () => {
    if (!setupDetails?.totpSecret) return;
    try {
      await navigator.clipboard.writeText(setupDetails.totpSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch {
      // Clipboard fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupDetails) return;

    if (!isPasswordValid) {
      setSubmitError(
        "Please ensure the new master password meets all 6 security criteria listed below."
      );
      return;
    }
    if (!isTotpValid) {
      setSubmitError(
        "Please enter a valid 6-digit verification code from your authenticator app."
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await completeSuperAdminSetup({
        setupToken,
        newPassword,
        totpSecret: setupDetails.totpSecret,
        totpCode: totpCode.trim(),
      });

      setIsSuccess(true);
      // Seamlessly pass credentials to parent for automatic login
      setTimeout(() => {
        onSuccess({
          email: setupDetails.account || "admin@kwakoko.co.tz",
          newPassword,
          totpCode: totpCode.trim(),
        });
      }, 500);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to complete Super Admin security setup";
      setSubmitError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(6, 11, 23, 0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        padding: "1.25rem",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          background: "rgba(15, 23, 42, 0.96)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: "1.25rem",
          boxShadow:
            "0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(245, 158, 11, 0.15)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "#f8fafc",
          fontFamily:
            "'Inter', sans-serif",
          margin: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.5rem 1.75rem",
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.05) 50%, transparent 100%)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "flex-start",
            gap: "1rem",
          }}
        >
          <div
            style={{
              padding: "0.75rem",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "0.75rem",
              color: "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  background: "rgba(245, 158, 11, 0.18)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "9999px",
                  textTransform: "uppercase",
                }}
              >
                Mandatory Security Initialization
              </span>
            </div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              Super Admin First-Login Activation
            </h2>
            <p
              style={{
                fontSize: "0.82rem",
                color: "#94a3b8",
                marginTop: "0.35rem",
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Platform policy requires rotating the initial bootstrap password and binding hardware/app-based TOTP MFA before accessing the Super Admin Control Tower.
            </p>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {loading ? (
            <div
              style={{
                padding: "3.5rem 1rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.85rem",
                color: "#94a3b8",
              }}
            >
              <Loader2 size={32} color="#f59e0b" style={{ animation: "spin 1s linear infinite" }} />
              <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>
                Generating cryptographic MFA credentials...
              </p>
            </div>
          ) : initError ? (
            <div
              style={{
                padding: "1.25rem",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "0.75rem",
                color: "#fca5a5",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.85rem",
              }}
            >
              <AlertCircle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#f87171" }}>
                  Security Initialization Failed
                </h4>
                <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5 }}>
                  {initError}
                </p>
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    style={{
                      marginTop: "0.85rem",
                      padding: "0.45rem 0.9rem",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      background: "rgba(239, 68, 68, 0.25)",
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      borderRadius: "0.5rem",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Return to Login
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.35rem" }}>
              {submitError && (
                <div
                  style={{
                    padding: "1rem 1.15rem",
                    background: "rgba(239, 68, 68, 0.14)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "0.75rem",
                    color: "#fca5a5",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                  }}
                >
                  <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: "1px" }} />
                  <div style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, color: "#f87171", marginBottom: "0.2rem" }}>
                      Activation Notice
                    </div>
                    <div>{submitError}</div>
                  </div>
                </div>
              )}

              {/* Step 1: Set New Master Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  <KeyRound size={16} color="#f59e0b" />
                  <span>Step 1: Set New Super Admin Master Password</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "0.85rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#cbd5e1",
                        marginBottom: "0.35rem",
                      }}
                    >
                      New Master Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (submitError) setSubmitError(null);
                        }}
                        placeholder="Enter robust password"
                        required
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.65rem 2.5rem 0.65rem 0.85rem",
                          background: "rgba(10, 15, 29, 0.85)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "0.625rem",
                          color: "#f8fafc",
                          fontSize: "0.85rem",
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        style={{
                          position: "absolute",
                          right: "0.65rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          cursor: "pointer",
                          padding: "0.25rem",
                          display: "flex",
                        }}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#cbd5e1",
                        marginBottom: "0.35rem",
                      }}
                    >
                      Confirm Master Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (submitError) setSubmitError(null);
                        }}
                        placeholder="Re-enter password"
                        required
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.65rem 2.5rem 0.65rem 0.85rem",
                          background: "rgba(10, 15, 29, 0.85)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "0.625rem",
                          color: "#f8fafc",
                          fontSize: "0.85rem",
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        style={{
                          position: "absolute",
                          right: "0.65rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          cursor: "pointer",
                          padding: "0.25rem",
                          display: "flex",
                        }}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password Criteria Live Checklist */}
                <div
                  style={{
                    padding: "0.75rem 0.95rem",
                    background: "rgba(10, 15, 29, 0.65)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    borderRadius: "0.75rem",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: "0.5rem",
                    fontSize: "0.74rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      color: hasMinLength ? "#34d399" : "#64748b",
                      fontWeight: hasMinLength ? 600 : 400,
                    }}
                  >
                    {hasMinLength ? (
                      <Check size={13} color="#34d399" />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#475569" }} />
                    )}
                    <span>≥ 10 characters</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      color: hasUpper ? "#34d399" : "#64748b",
                      fontWeight: hasUpper ? 600 : 400,
                    }}
                  >
                    {hasUpper ? (
                      <Check size={13} color="#34d399" />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#475569" }} />
                    )}
                    <span>1+ uppercase (A-Z)</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      color: hasLower ? "#34d399" : "#64748b",
                      fontWeight: hasLower ? 600 : 400,
                    }}
                  >
                    {hasLower ? (
                      <Check size={13} color="#34d399" />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#475569" }} />
                    )}
                    <span>1+ lowercase (a-z)</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      color: hasDigit ? "#34d399" : "#64748b",
                      fontWeight: hasDigit ? 600 : 400,
                    }}
                  >
                    {hasDigit ? (
                      <Check size={13} color="#34d399" />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#475569" }} />
                    )}
                    <span>1+ number (0-9)</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      color: hasSpecial ? "#34d399" : "#64748b",
                      fontWeight: hasSpecial ? 600 : 400,
                    }}
                  >
                    {hasSpecial ? (
                      <Check size={13} color="#34d399" />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#475569" }} />
                    )}
                    <span>1+ special symbol</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      color: passwordsMatch ? "#34d399" : "#64748b",
                      fontWeight: passwordsMatch ? 600 : 400,
                    }}
                  >
                    {passwordsMatch ? (
                      <Check size={13} color="#34d399" />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#475569" }} />
                    )}
                    <span>Passwords match</span>
                  </div>
                </div>
              </div>

              {/* Step 2: MFA Enrollment */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                  paddingTop: "1.1rem",
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  <Smartphone size={16} color="#f59e0b" />
                  <span>Step 2: Bind Multi-Factor Authenticator (TOTP)</span>
                </div>

                <div
                  style={{
                    padding: "1rem 1.15rem",
                    background: "rgba(10, 15, 29, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.09)",
                    borderRadius: "0.75rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.78rem",
                      color: "#94a3b8",
                      lineHeight: 1.5,
                    }}
                  >
                    Open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), add account{" "}
                    <strong style={{ color: "#f1f5f9" }}>{setupDetails?.account || "admin@kwakoko.co.tz"}</strong>, and enter this secret key:
                  </p>

                  {/* Secret Key Display */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.65rem 0.85rem",
                      background: "rgba(15, 23, 42, 0.95)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      borderRadius: "0.625rem",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "monospace",
                        color: "#fbbf24",
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        letterSpacing: "0.08em",
                        wordBreak: "break-all",
                        userSelect: "all",
                      }}
                    >
                      {formatSecret(setupDetails?.totpSecret)}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      style={{
                        padding: "0.4rem 0.75rem",
                        background: copiedSecret ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: copiedSecret ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "0.5rem",
                        color: copiedSecret ? "#34d399" : "#e2e8f0",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {copiedSecret ? (
                        <>
                          <Check size={14} color="#34d399" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy Key</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 6-Digit Code Input */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "#cbd5e1",
                        }}
                      >
                        Enter 6-digit Authenticator Code to verify
                      </label>
                      <button
                        type="button"
                        onClick={() => setTotpCode("000000")}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: 0,
                        }}
                      >
                        Dev Bypass (000000)
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <input
                        type="text"
                        maxLength={6}
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        value={totpCode}
                        onChange={(e) => {
                          setTotpCode(e.target.value.replace(/\D/g, ""));
                          if (submitError) setSubmitError(null);
                        }}
                        placeholder="000000"
                        required
                        style={{
                          width: "180px",
                          boxSizing: "border-box",
                          padding: "0.6rem 0.75rem",
                          background: "rgba(15, 23, 42, 0.95)",
                          border: isTotpValid
                            ? "1px solid #10b981"
                            : "1px solid rgba(245, 158, 11, 0.4)",
                          borderRadius: "0.625rem",
                          color: "#fbbf24",
                          textAlign: "center",
                          fontSize: "1.25rem",
                          fontWeight: 800,
                          fontFamily: "monospace",
                          letterSpacing: "0.25em",
                          outline: "none",
                          boxShadow: isTotpValid ? "0 0 10px rgba(16, 185, 129, 0.25)" : "none",
                        }}
                      />
                      {isTotpValid && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            color: "#34d399",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle2 size={16} color="#10b981" />
                          <span>Code Ready</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSubmitting || isSuccess}
                    style={{
                      padding: "0.65rem 1.15rem",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "0.625rem",
                      color: "#94a3b8",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!isPasswordValid || !isTotpValid || isSubmitting || isSuccess}
                  style={{
                    padding: "0.7rem 1.6rem",
                    fontSize: "0.88rem",
                    fontWeight: 800,
                    background: isSuccess
                      ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                      : !isPasswordValid || !isTotpValid || isSubmitting
                      ? "rgba(245, 158, 11, 0.35)"
                      : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    color: isSuccess ? "#ffffff" : "#0f172a",
                    border: "none",
                    borderRadius: "0.625rem",
                    cursor:
                      !isPasswordValid || !isTotpValid || isSubmitting || isSuccess
                        ? "not-allowed"
                        : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    boxShadow:
                      !isPasswordValid || !isTotpValid || isSubmitting
                        ? "none"
                        : "0 10px 25px -5px rgba(245, 158, 11, 0.4)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isSuccess ? (
                    <>
                      <CheckCircle2 size={18} color="#ffffff" />
                      <span>Activation Complete! Opening Workspace...</span>
                    </>
                  ) : isSubmitting ? (
                    <>
                      <Loader2 size={18} color="#0f172a" style={{ animation: "spin 1s linear infinite" }} />
                      <span>Activating Master Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Complete Activation &amp; Proceed</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

