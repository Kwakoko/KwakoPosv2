import { useEffect, useRef } from "react";
import { apiFetch } from "../services/apiClient.js";

interface HeartbeatServiceProps {
  enabled: boolean;
  intervalMs: number;
  onFailure: (error: unknown) => void;
  onSuccess?: (data: any) => void;
}

export const HeartbeatService: React.FC<HeartbeatServiceProps> = ({ enabled, intervalMs, onFailure, onSuccess }) => {
  const running = useRef(false);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const beat = async () => {
      if (running.current || document.visibilityState === "hidden") return;
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
    void beat();
    const id = window.setInterval(() => void beat(), Math.max(60_000, intervalMs));
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, onFailure, onSuccess]);
  return null;
};
