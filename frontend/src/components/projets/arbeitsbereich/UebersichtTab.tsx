import { useTranslation } from "react-i18next";

import { useArbeitsbereich } from "../../../hooks/useProjets";
import type { Aufgabe } from "../../../types/projets";
import { STATUS_REIHENFOLGE } from "./konstanten";

/** Vue d'ensemble (2026-10-06) : progression calculée côté serveur (tâches terminées / total),
 * répartition par statut, prochaines échéances. */
export default function UebersichtTab({
  projetId,
  aufgaben,
}: {
  projetId: string;
  aufgaben: Aufgabe[];
}) {
  const { t } = useTranslation("projets");
  const bereich = useArbeitsbereich(projetId);
  const daten = bereich.data;
  const naechste = aufgaben
    .filter((a) => a.frist && a.status !== "erledigt")
    .sort((a, b) => (a.frist as string).localeCompare(b.frist as string))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("arbeitsbereich.uebersicht.fortschritt")}
          </h3>
          <span className="text-sm text-text-secondary">{daten ? `${daten.prozent}%` : "–"}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={daten?.prozent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-bg-tertiary"
        >
          <div className="h-full bg-ca" style={{ width: `${daten?.prozent ?? 0}%` }} />
        </div>
        {daten && (
          <p className="mt-2 text-xs text-text-tertiary">
            {t("arbeitsbereich.uebersicht.zusammenfassung", {
              erledigt: daten.erledigt,
              gesamt: daten.gesamt,
              team: daten.team_groesse,
            })}
          </p>
        )}
      </div>

      {daten && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {STATUS_REIHENFOLGE.map((s) => (
            <div key={s} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
              <div className="text-xl font-bold text-text-primary">{daten.pro_status[s]}</div>
              <div className="text-xs text-text-tertiary">{t(`arbeitsbereich.status.${s}`)}</div>
            </div>
          ))}
          <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div
              className={`text-xl font-bold ${
                daten.ueberfaellig > 0 ? "text-status-dangerText" : "text-text-primary"
              }`}
            >
              {daten.ueberfaellig}
            </div>
            <div className="text-xs text-text-tertiary">
              {t("arbeitsbereich.uebersicht.ueberfaellig")}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">
          {t("arbeitsbereich.uebersicht.naechste_fristen")}
        </h3>
        {naechste.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            {t("arbeitsbereich.uebersicht.keine_fristen")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {naechste.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="truncate text-text-primary">{a.titel}</span>
                <span className={a.ueberfaellig ? "text-status-dangerText" : "text-text-tertiary"}>
                  {new Date(a.frist as string).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
