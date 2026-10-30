/**
 * Icon eines Kalendereintrags (2026-10-30) : macht die Terminarten auf einen Blick erkennbar.
 * Einträge aus anderen Modulen (Abstimmung, Umfrage, Aufgabe, Zahlungsfristen …) haben ein
 * eigenes Icon nach `quelle` ; sonst bestimmt die Kategorie das Icon. Rein dekorativ
 * (aria-hidden) — die Kategorie steht weiterhin als Text daneben bzw. im Tooltip.
 */
import type { KalenderEintrag } from "../../types/kalender";
import { iconFuer } from "../../utils/terminIcon";

interface Props {
  eintrag: Pick<KalenderEintrag, "kategorie" | "quelle">;
  size?: number;
  className?: string;
}

export default function TerminIcon({ eintrag, size = 14, className = "" }: Props) {
  const Symbol = iconFuer(eintrag);
  return (
    <Symbol
      size={size}
      stroke={2}
      aria-hidden="true"
      data-testid="termin-icon"
      className={`shrink-0 ${className}`}
    />
  );
}
