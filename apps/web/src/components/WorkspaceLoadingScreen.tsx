import React, { useEffect, useState } from "react";
import {
  Shield,
  Database,
  Cpu,
  RefreshCw,
  Zap,
  Globe,
  CheckCircle2,
  Layers,
  ArrowRight,
} from "lucide-react";

interface BootStage {
  label: string;
  subsystem: string;
  icon: React.ElementType;
}

const BOOT_STAGES: BootStage[] = [
  {
    label: "Mounting IndexedDB Offline Stock Ledger & Outbox Vault",
    subsystem: "DATA LAYER",
    icon: Database,
  },
  {
    label: "Verifying Hardware Cryptographic Signatures & Security Token",
    subsystem: "SECURITY",
    icon: Shield,
  },
  {
    label: "Hydrating Multi-Tenant Context & RBAC Authorization Policy",
    subsystem: "ACCESS CONTROL",
    icon: Cpu,
  },
  {
    label: "Calibrating Multi-Currency Rates & TRA VFD Fiscal Compliance",
    subsystem: "FISCAL COMPLIANCE",
    icon: Zap,
  },
  {
    label: "Synchronizing Workspace Modules & Regional Translation Dictionaries",
    subsystem: "OPERATING SYSTEM",
    icon: Globe,
  },
];

export const WorkspaceLoadingScreen: React.FC<{
  onForceContinue?: () => void;
}> = ({ onForceContinue }) => {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(14);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Cycle boot stages and advance progress bar smoothly to 100%
  useEffect(() => {
    const stageInterval = setInterval(() => {
      setStageIndex((prev) => {
        if (prev < BOOT_STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 550);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        const remaining = 100 - prev;
        const increment = Math.max(2, Math.floor(remaining / 3));
        const next = Math.min(100, prev + increment);
        if (next >= 100) {
          setIsReady(true);
        }
        return next;
      });
    }, 200);

    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
      clearInterval(timer);
    };
  }, []);

  // Keyboard shortcut: Pressing Enter triggers continue
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onForceContinue?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onForceContinue]);

  const currentStage = BOOT_STAGES[stageIndex];
  const StageIcon = currentStage.icon;

  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0a0f1d",
        color: "#f8fafc",
        fontFamily:
          "'Inter', sans-serif",
        padding: "1.5rem",
        boxSizing: "border-box",
      }}
    >
      {/* Background Architectural Ambient Lighting */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(ellipse 65% 50% at 50% 35%, rgba(56, 189, 248, 0.14) 0%, rgba(129, 140, 248, 0.05) 45%, transparent 75%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(circle at 50% 100%, rgba(14, 165, 233, 0.08) 0%, transparent 50%)",
        }}
      />

      {/* Subtle Precision Matrix Background Dots */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.25,
          backgroundImage:
            "radial-gradient(rgba(148, 163, 184, 0.4) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, #000 30%, transparent 90%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, #000 30%, transparent 90%)",
        }}
      />

      {/* Center Architectural Glassmorphism Command Card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "540px",
          background: "rgba(15, 23, 42, 0.78)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: "1.5rem",
          border: "1px solid rgba(255, 255, 255, 0.09)",
          boxShadow:
            "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(56, 189, 248, 0.08)",
          padding: "2.5rem 2.25rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* Emblem Pod with Orbiting Rings & Core Icon */}
        <div
          style={{
            position: "relative",
            width: "88px",
            height: "88px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.75rem",
          }}
        >
          {/* Ambient Glow */}
          <div
            style={{
              position: "absolute",
              inset: "-12px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, transparent 70%)",
              filter: "blur(14px)",
              animation: "kwako-pulse-glow 3s ease-in-out infinite alternate",
            }}
          />

          {/* Outer Orbital Rotating Ring */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              animation: "kwako-spin-slow 12s linear infinite",
            }}
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="url(#kwakoRingGrad)"
              strokeWidth="1.75"
              strokeDasharray="6 8"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient
                id="kwakoRingGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#818cf8" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
              </linearGradient>
            </defs>
          </svg>

          {/* Counter-Rotating Inner Radar Arc */}
          <svg
            style={{
              position: "absolute",
              inset: "4px",
              width: "calc(100% - 8px)",
              height: "calc(100% - 8px)",
              animation: "kwako-spin-reverse 7s linear infinite",
            }}
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="rgba(56, 189, 248, 0.45)"
              strokeWidth="1.5"
              strokeDasharray="40 180"
              strokeLinecap="round"
            />
          </svg>

          {/* Center Brand Monogram Shield */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "1rem",
              background:
                "linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #818cf8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:
                "0 8px 24px rgba(56, 189, 248, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4)",
              position: "relative",
              zIndex: 2,
            }}
          >
            <span
              style={{
                fontSize: "1.75rem",
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: "-0.05em",
                lineHeight: 1,
                userSelect: "none",
                textShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
              }}
            >
              K
            </span>

            {/* Pulsing Status Dot on Crest */}
            <div
              style={{
                position: "absolute",
                top: "-3px",
                right: "-3px",
                width: "11px",
                height: "11px",
                borderRadius: "50%",
                background: "#4ade80",
                border: "2px solid #0f172a",
                boxShadow: "0 0 8px #4ade80",
              }}
            />
          </div>
        </div>

        {/* Brand Typography & Enterprise Status Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.35rem",
          }}
        >
          <span
            style={{
              fontSize: "1.65rem",
              fontWeight: 900,
              letterSpacing: "-0.035em",
              color: "#ffffff",
            }}
          >
            Kwako<span style={{ color: "#38bdf8" }}>Pos</span>
          </span>
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              padding: "0.2rem 0.55rem",
              borderRadius: "9999px",
              background: "rgba(56, 189, 248, 0.12)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.28)",
              textTransform: "uppercase",
            }}
          >
            v2.2 Enterprise
          </span>
        </div>

        <p
          style={{
            fontSize: "0.82rem",
            fontWeight: 500,
            color: "#94a3b8",
            margin: "0 0 1.75rem 0",
            letterSpacing: "-0.01em",
          }}
        >
          Kwakoko Business Operating System Core
        </p>

        {/* Dynamic Boot Sequence Progress Bar */}
        <div
          style={{
            width: "100%",
            marginBottom: "1.4rem",
          }}
        >
          {/* Progress Header & Percentage Readout */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.6rem",
              fontSize: "0.72rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#64748b",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                color: "#38bdf8",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#38bdf8",
                  boxShadow: "0 0 6px #38bdf8",
                  display: "inline-block",
                  animation: "kwako-blink 1.2s infinite ease-in-out",
                }}
              />
              {isReady ? "SYSTEM READY" : currentStage.subsystem}
            </span>
            <span
              style={{
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                color: isReady ? "#38bdf8" : "#e2e8f0",
                fontSize: "0.78rem",
                fontWeight: 700,
              }}
            >
              {progress}%
            </span>
          </div>

          {/* High-Tech Progress Track with Shimmer Light Trail */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "7px",
              borderRadius: "9999px",
              background: "rgba(30, 41, 59, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, #0284c7 0%, #38bdf8 65%, #818cf8 100%)",
                borderRadius: "9999px",
                transition: "width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)",
                boxShadow: "0 0 14px rgba(56, 189, 248, 0.6)",
              }}
            >
              {/* Traveling Specular Highlight Beam */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.65) 50%, transparent 100%)",
                  animation: "kwako-shimmer-beam 1.6s infinite linear",
                }}
              />
            </div>
          </div>
        </div>

        {/* Live Active Stage Card */}
        <div
          style={{
            width: "100%",
            background: "rgba(30, 41, 59, 0.55)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: "0.85rem",
            padding: "0.85rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            marginBottom: "1.75rem",
            textAlign: "left",
            boxSizing: "border-box",
            minHeight: "58px",
          }}
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "0.6rem",
              background: isReady ? "rgba(56, 189, 248, 0.2)" : "rgba(56, 189, 248, 0.12)",
              color: "#38bdf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isReady ? <CheckCircle2 size={18} /> : <StageIcon size={17} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#e2e8f0",
                lineHeight: 1.35,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {isReady ? "Workspace Modules & Translation Dictionaries Ready" : currentStage.label}
            </div>
            <div
              style={{
                fontSize: "0.67rem",
                color: isReady ? "#38bdf8" : "#64748b",
                marginTop: "0.15rem",
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              }}
            >
              {isReady
                ? "STAGE 5 OF 5 • SUBSYSTEMS READY • CLICK ENTER TO PROCEED"
                : `STAGE ${stageIndex + 1} OF ${BOOT_STAGES.length} • ZERO-LATENCY IDB`}
            </div>
          </div>
        </div>

        {/* Architectural Pillar Badges (Horizontal Telemetry Strip) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.5rem",
            width: "100%",
            paddingTop: "0.75rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          {[
            { tag: "OFFLINE", desc: "IndexedDB", color: "#4ade80" },
            { tag: "CRYPTO", desc: "Hardware Vault", color: "#38bdf8" },
            { tag: "FISCAL", desc: "TRA VFD EFD", color: "#fbbf24" },
            { tag: "LOCALE", desc: "EN • FR • SW", color: "#818cf8" },
          ].map((pill, i) => (
            <div
              key={i}
              style={{
                background: "rgba(15, 23, 42, 0.45)",
                border: "1px solid rgba(255, 255, 255, 0.04)",
                borderRadius: "0.55rem",
                padding: "0.45rem 0.35rem",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  color: pill.color,
                  letterSpacing: "0.04em",
                }}
              >
                ● {pill.tag}
              </div>
              <div
                style={{
                  fontSize: "0.6rem",
                  color: "#64748b",
                  marginTop: "0.1rem",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {pill.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Enter Action Card (Always Present - Waits for User Click) */}
        <div
          style={{
            marginTop: "1.25rem",
            width: "100%",
            padding: "0.75rem 1rem",
            borderRadius: "0.75rem",
            background: isReady ? "rgba(56, 189, 248, 0.09)" : "rgba(56, 189, 248, 0.06)",
            border: isReady ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(56, 189, 248, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            textAlign: "left",
            boxShadow: isReady ? "0 0 20px rgba(56, 189, 248, 0.12)" : "none",
            animation: "kwako-fade-in 0.4s ease-out",
            transition: "all 0.3s ease",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.74rem",
                fontWeight: 700,
                color: "#e2e8f0",
              }}
            >
              {isReady ? "Workspace Ready" : "Local Cache Preserved"}
            </div>
            <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
              {isReady ? "All systems active. Click Enter or press ↵" : "Ready to work in offline mode"}
            </div>
          </div>
          {onForceContinue && (
            <button
              type="button"
              onClick={onForceContinue}
              style={{
                background: "#0284c7",
                color: "#ffffff",
                border: isReady ? "1px solid rgba(255, 255, 255, 0.25)" : "none",
                borderRadius: "0.5rem",
                padding: "0.45rem 0.95rem",
                fontSize: "0.74rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                boxShadow: isReady
                  ? "0 4px 14px rgba(2, 132, 199, 0.6)"
                  : "0 2px 8px rgba(2, 132, 199, 0.4)",
                transition: "all 0.15s ease",
              }}
            >
              Enter <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Embedded High-Performance Keyframe Animations */}
      <style>{`
        @keyframes kwako-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes kwako-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes kwako-pulse-glow {
          0% { transform: scale(0.92); opacity: 0.55; }
          100% { transform: scale(1.15); opacity: 0.95; }
        }
        @keyframes kwako-shimmer-beam {
          0% { transform: translateX(-150%); }
          100% { transform: translateX(250%); }
        }
        @keyframes kwako-blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
        @keyframes kwako-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
};
