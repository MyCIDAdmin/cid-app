/**
 * Drei Kennzahlen unter der Mitgliedskarte (Release 2026.11) : Tage bis zum Ende der Kampagne,
 * Jahre dabei und Mitglied seit. Die Zahlen zählen beim Öffnen hoch (AnimatedNumber, steht still
 * bei „Bewegung reduzieren“). Fehlt ein Wert (noch nicht geladen), entfällt seine Kachel.
 */
import { useTranslation } from "react-i18next";

import AnimatedNumber from "../ui/AnimatedNumber";

const ganzzahl = (n: number) => String(Math.round(n));

function Kachel({ zahl, beschriftung }: { zahl: number; beschriftung: string }) {
  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 text-left shadow-sm">
      <div className="font-display text-2xl font-bold tabular-nums text-text-primary sm:text-3xl">
        <AnimatedNumber value={zahl} format={ganzzahl} />
      </div>
      <div className="text-[11px] text-text-tertiary sm:text-xs">{beschriftung}</div>
    </div>
  );
}

export default function Kennzahlen({
  tage,
  jahre,
  seit,
}: {
  tage?: number | null;
  jahre?: number | null;
  seit?: number | null;
}) {
  const { t } = useTranslation("adhesions");
  const kacheln = [
    tage != null && { key: "tage", zahl: tage, text: t("kennzahlen.tage", { count: tage }) },
    jahre != null &&
      jahre > 0 && {
        key: "jahre",
        zahl: jahre,
        text: t("kennzahlen.jahre", { count: jahre }),
      },
    seit != null && seit > 0 && { key: "seit", zahl: seit, text: t("kennzahlen.seit") },
  ].filter(Boolean) as { key: string; zahl: number; text: string }[];
  if (kacheln.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2" data-testid="kennzahlen">
      {kacheln.map((k) => (
        <Kachel key={k.key} zahl={k.zahl} beschriftung={k.text} />
      ))}
    </div>
  );
}
