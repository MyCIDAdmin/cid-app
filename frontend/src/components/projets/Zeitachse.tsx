/**
 * Zeitachse eines Projekts (Nutzerwunsch 2026-10-20, „5 Jahre“): ein Balken von Beginn bis Ende
 * mit einem Punkt je Meilenstein (gefüllt = erreicht) und einer Marke für heute. Reine
 * Darstellung — alle Daten kommen aus der Projektübersicht ; ohne Beginn und Ende gibt es keine
 * Achse. Die Details stehen in der Meilensteinliste darunter, die Punkte sind nur Orientierung.
 */
import { useTranslation } from "react-i18next";

import type { Meilenstein } from "../../types/projets";
import { lokaleSprache } from "../../utils/datum";

function prozent(datum: number, beginn: number, ende: number): number {
  if (ende <= beginn) return 0;
  return Math.min(100, Math.max(0, ((datum - beginn) / (ende - beginn)) * 100));
}

export default function Zeitachse({
  beginn,
  ende,
  meilensteine,
  heute = new Date(),
}: {
  beginn: string | null;
  ende: string | null;
  meilensteine: Meilenstein[];
  /** Injizierbar für Tests. */
  heute?: Date;
}) {
  const { t } = useTranslation("projets");
  if (!beginn || !ende) return null;

  const start = new Date(beginn).getTime();
  const stop = new Date(ende).getTime();
  if (stop <= start) return null;

  const heuteProzent = prozent(heute.getTime(), start, stop);
  const verstrichen = heute.getTime() >= start;
  const punkte = meilensteine.filter((m) => m.faellig_am);

  return (
    <div data-testid="zeitachse">
      <div className="relative mx-2 h-8">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-bg-tertiary" />
        {verstrichen && (
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ca/60"
            style={{ width: `${heuteProzent}%` }}
          />
        )}
        {punkte.map((m) => (
          <span
            key={m.id}
            title={`${m.titel} · ${new Date(m.faellig_am as string).toLocaleDateString(lokaleSprache())}`}
            data-erledigt={m.erledigt}
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
              m.erledigt ? "border-ca bg-ca" : "border-ca bg-bg-primary"
            }`}
            style={{ left: `${prozent(new Date(m.faellig_am as string).getTime(), start, stop)}%` }}
          />
        ))}
        {verstrichen && heute.getTime() <= stop && (
          <span
            className="absolute top-0 h-8 w-px bg-status-dangerText"
            style={{ left: `${heuteProzent}%` }}
            title={t("dach.heute") ?? ""}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-text-tertiary">
        <span>{new Date(beginn).toLocaleDateString(lokaleSprache())}</span>
        <span>{new Date(ende).toLocaleDateString(lokaleSprache())}</span>
      </div>
    </div>
  );
}
