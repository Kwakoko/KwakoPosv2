import { useEffect, useRef } from "react";
import { apiFetch } from "../services/apiClient.js";

interface HeartbeatServiceProps {
  enabled: boolean;
  intervalMs: number;
  lastActivityAt: number;
  onFailure: (error: unknown) => void;
  onSuccess?: (data: any) => void;
}

export const HeartbeatService: React.FC<HeartbeatServiceProps> = ({ enabled, intervalMs, lastActivityAt, onFailure, onSuccess }) => {
  const running = useRef(false);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const beat = async () => {
      if (running.current || document.visibilityState === "hidden" || Date.now() - lastActivityAt > intervalMs) return;
      running.current = true;
      try {
        const result = await apiFetch<any>("/auth/session/heartbeat", { method: "POST" });
        onSuccess?.(result?.data || result);
      } catch (error) {
        onFailure(error);
      } finally {
        running.current = false;
      }
    };
    // Do not fire immediately when authentication becomes active. The login/refresh
    // flow has just established the bearer token and durable session; an immediate
    // heartbeat can race that state transition and incorrectly trigger logout.
    // The session validation/expiry ticker is authoritative during this window.
    const id = window.setInterval(() => void beat(), Math.max(60_000, intervalMs));
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, lastActivityAt, onFailure, onSuccess]);
  return null;
};
