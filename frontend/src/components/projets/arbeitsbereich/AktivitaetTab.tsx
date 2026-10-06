import { useTranslation } from "react-i18next";

import { useAktivitaeten } from "../../../hooks/useProjets";
import type { AktivitaetEintrag } from "../../../types/projets";

function euro(betrag: string): string {
  const zahl = Number(betrag);
  return Number.isNaN(zahl) ? betrag : `${zahl.toFixed(2).replace(".", ",")} €`;
}

/** Aktivitätsprotokoll des Projekts (2026-10-07), nur lesend : wer hat wann was getan. Die Sätze
 * entstehen hier aus `aktion` + `objekt`/`detail` (sprachneutral gespeichert, siehe Backend). */
export default function AktivitaetTab({ projetId }: { projetId: string }) {
  const { t, i18n } = useTranslation("projets");
  const abfrage = useAktivitaeten(projetId);
  const eintraege = abfrage.data ?? [];

  function satz(e: AktivitaetEintrag): string {
    const basis = { akteur: e.akteur_name || "–", objekt: e.objekt };
    switch (e.aktion) {
      case "aufgabe_verschoben": {
        const [von, nach] = e.detail.split(">");
        return t("arbeitsbereich.aktivitaet.aktion.aufgabe_verschoben", {
          ...basis,
          von: t(`arbeitsbereich.status.${von}`),
          nach: t(`arbeitsbereich.status.${nach}`),
        });
      }
      case "aufgabe_zugewiesen":
        return t("arbeitsbereich.aktivitaet.aktion.aufgabe_zugewiesen", {
          ...basis,
          detail: e.detail,
        });
      case "team_hinzugefuegt":
      case "team_rolle":
        return t(`arbeitsbereich.aktivitaet.aktion.${e.aktion}`, {
          ...basis,
          rolle: t(`arbeitsbereich.rolle.${e.detail}`),
        });
      case "sichtbarkeit":
        return t("arbeitsbereich.aktivitaet.aktion.sichtbarkeit", {
          ...basis,
          zustand: t(`arbeitsbereich.aktivitaet.zustand.${e.detail}`),
        });
      case "plan_gesetzt":
      case "kosten_erfasst":
        return t(`arbeitsbereich.aktivitaet.aktion.${e.aktion}`, {
          ...basis,
          betrag: euro(e.detail),
        });
      default:
        return t(`arbeitsbereich.aktivitaet.aktion.${e.aktion}`, basis);
    }
  }

  if (abfrage.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("arbeitsbereich.laden")}</p>;
  }
  if (abfrage.isError) {
    return (
      <p className="text-sm text-status-dangerText">{t("arbeitsbereich.aktivitaet.fehler")}</p>
    );
  }
  if (eintraege.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("arbeitsbereich.aktivitaet.leer")}</p>;
  }
  return (
    <ul className="space-y-2">
      {eintraege.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-cid bg-bg-primary p-2 text-sm shadow-sm"
        >
          <span className="text-text-primary">{satz(e)}</span>
          <time dateTime={e.zeitpunkt} className="text-xs text-text-tertiary">
            {new Date(e.zeitpunkt).toLocaleString(i18n.language)}
          </time>
        </li>
      ))}
    </ul>
  );
}
