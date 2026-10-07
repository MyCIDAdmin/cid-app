import { useEffect } from "react";

/** Schließt einen Dialog mit der Escape-Taste (Tastaturbedienung, WCAG 2.1.2). */
export function useEscapeSchliessen(onClose: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}
