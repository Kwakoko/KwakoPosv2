import { useEffect, useState } from "react";

export interface SessionTimerProps {
  lastActivityAt: number;
  idleTimeoutMs: number;
  absoluteExpiresAt: number;
  online: boolean;
}

export function formatSessionCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

export const SessionTimer: React.FC<SessionTimerProps> = ({ lastActivityAt, idleTimeoutMs, absoluteExpiresAt, online }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 1_000);
    return () => window.clearInterval(id);
  }, [online]);
  const now = Date.now();
  const idleRemaining = Math.max(0, lastActivityAt + idleTimeoutMs - now);
  const absoluteRemaining = Math.max(0, absoluteExpiresAt - now);
  return <>{formatSessionCountdown(Math.min(idleRemaining, absoluteRemaining))}</>;
};
