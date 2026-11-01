/** Ziel-Element der Tour im DOM (Browser-Zugriff, daher getrennt von utils/tour.ts). */

/** Erstes sichtbares Element mit `data-tour` (Seitenleiste und Handy-Menü tragen dieselben Werte). */
export function findeZiel(ziel: string): HTMLElement | null {
  const kandidaten = document.querySelectorAll<HTMLElement>(`[data-tour="${ziel}"]`);
  for (const el of Array.from(kandidaten)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}
