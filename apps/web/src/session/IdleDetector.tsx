import { useEffect, useRef } from "react";

interface IdleDetectorProps {
  enabled: boolean;
  onActivity: () => void;
}

const EVENTS: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "touchstart", "touchmove", "scroll", "wheel", "pointerdown"];

export const IdleDetector: React.FC<IdleDetectorProps> = ({ enabled, onActivity }) => {
  const lastEmit = useRef(0);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const handle = () => {
      const now = Date.now();
      if (now - lastEmit.current < 1_000) return;
      lastEmit.current = now;
      onActivity();
    };
    EVENTS.forEach((event) => window.addEventListener(event, handle, { passive: true }));
    window.addEventListener("popstate", handle);
    return () => {
      EVENTS.forEach((event) => window.removeEventListener(event, handle));
      window.removeEventListener("popstate", handle);
    };
  }, [enabled, onActivity]);
  return null;
};
