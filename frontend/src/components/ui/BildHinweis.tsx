/**
 * Hinweis zu Format und Größe hochzuladender Bilder (Nutzerwunsch vom 2026-10-06 : "Hinweise zu
 * den Formaten ... damit die immer passen"). Die Kacheln (Shop, Projekte, Veranstaltungen)
 * füllen die Bildfläche vollständig aus (object-cover) — passende Seitenverhältnisse vermeiden
 * unerwünschte Beschnitte. Dateigrößenlimit : 10 MB (MAX_KACHEL_SIZE_BYTES, Backend).
 */
import { useTranslation } from "react-i18next";

export type BildVariante = "shop" | "projekt" | "veranstaltung";

interface BildHinweisProps {
  variante: BildVariante;
  className?: string;
}

export default function BildHinweis({ variante, className = "" }: BildHinweisProps) {
  const { t } = useTranslation("common");
  return (
    <p className={`text-[11px] leading-snug text-text-tertiary ${className}`}>
      🖼️ {t(`bild_hinweis.${variante}`)}
    </p>
  );
}
