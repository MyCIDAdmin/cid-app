/**
 * Aktivität — Auffälligkeiten (Release 22) : von den Regeln erkannte Hinweise (z. B. viele
 * Fehlversuche, Massen-Export, neuer App-Admin). Offene Hinweise können als erledigt markiert werden.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuffaelligkeiten, useAuffaelligkeitErledigen } from "../../hooks/useAktivitaet";
import type { AuffaelligkeitStatus, JournalFilter } from "../../types/aktivitaet";
import { textIn, zeitpunkt } from "../../utils/aktivitaet";

const STATUS: AuffaelligkeitStatus[] = ["offen", "erledigt"];

export default function AuffaelligkeitenPanel({
  imJournalOeffnen,
}: {
  imJournalOeffnen: (filter: JournalFilter) => void;
}) {
  const { t, i18n } = useTranslation("aktivitaet");
  const [status, setStatus] = useState<AuffaelligkeitStatus>("offen");
  const { data, isLoading, isError } = useAuffaelligkeiten(status);
  const erledigen = useAuffaelligkeitErledigen();

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-tertiary">{t("auffaelligkeiten.hinweis")}</p>
      <div className="flex gap-2">
        {STATUS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-cid-lg px-3 py-1 text-xs font-medium ${
              status === s ? "bg-ca text-white" : "bg-bg-tertiary text-text-secondary"
            }`}
          >
            {t(`auffaelligkeiten.status.${s}`)}
            {s === "offen" ? ` (${data.offen})` : ""}
          </button>
        ))}
      </div>

      {data.ergebnisse.length === 0 ? (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-sm text-text-tertiary shadow-sm">
          {t(`auffaelligkeiten.leer_${status}`)}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.ergebnisse.map((a) => (
            <li key={a.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span
                    className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      a.gewicht === "wichtig"
                        ? "bg-status-dangerBg text-status-dangerText"
                        : "bg-status-warningBg text-status-warningText"
                    }`}
                  >
                    {t(`auffaelligkeiten.gewicht.${a.gewicht}`)}
                  </span>
                  <span className="text-sm text-text-primary">{textIn(i18n.language, a.text)}</span>
                  <div className="mt-1 text-xs text-text-tertiary">
                    {zeitpunkt(a.erkannt_am, i18n.language)}
                    {a.ip ? ` · ${a.ip}` : ""}
                    {a.status === "erledigt" && a.erledigt_von
                      ? ` · ${t("auffaelligkeiten.erledigt_von", {
                          name: a.erledigt_von.name,
                          zeit: zeitpunkt(a.erledigt_am, i18n.language),
                        })}`
                      : ""}
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-medium">
                  {(a.ip || a.user) && (
                    <button
                      type="button"
                      className="text-ca"
                      onClick={() =>
                        imJournalOeffnen(a.ip ? { ip: a.ip } : { q: a.user?.email ?? "" })
                      }
                    >
                      {t("uebersicht.im_journal")}
                    </button>
                  )}
                  {a.status === "offen" && (
                    <button
                      type="button"
                      className="text-status-successText disabled:opacity-50"
                      disabled={erledigen.isPending}
                      onClick={() => erledigen.mutate(a.id)}
                    >
                      {t("auffaelligkeiten.erledigen")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
