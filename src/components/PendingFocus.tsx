import { useEffect } from "react";

// Contextual navigation scrolls to a named row without mutating the shared flow filters.
export function usePendingFocus(focus?: string, tab?: string) {
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`pending-${focus}`);
      row?.scrollIntoView({ block: "center", inline: "nearest" });
      row?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, tab]);
}