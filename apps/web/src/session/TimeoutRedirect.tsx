import { useEffect } from "react";

interface TimeoutRedirectProps {
  active: boolean;
  redirectPath: string | null;
}

function sanitizeRedirect(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export const TimeoutRedirect: React.FC<TimeoutRedirectProps> = ({ active, redirectPath }) => {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const safe = sanitizeRedirect(redirectPath);
    const query = new URLSearchParams({ reason: "session_expired", redirect: safe });
    window.location.replace("/login?" + query.toString());
  }, [active, redirectPath]);
  return null;
};
