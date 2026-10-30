/** Dashboard-Kachel „Nächste Termine“ (Release 15) : die kommenden Einträge des Vereinskalenders. */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useKalenderEintraege } from "../../hooks/useKalender";
import type { Ansicht } from "../../types/kalender";
import { KATEGORIE_STIL, formatZeit } from "../../utils/kalender";
import { uebersetzt } from "../../utils/uebersetzung";
import TerminIcon from "./TerminIcon";

const VEREIN: Ansicht[] = ["verein"];

export default function NaechsteTermine() {
  const { t, i18n } = useTranslation("kalender");
  const { von, bis } = useMemo(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    return { von: start, bis: new Date(start.getTime() + 45 * 24 * 3600 * 1000) };
  }, []);
  const eintraege = useKalenderEintraege(VEREIN, von, bis);
  if (eintraege.isError) return null;
  const liste = (eintraege.data ?? []).filter((e) => !e.ausgeblendet).slice(0, 5);

  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm" data-testid="naechste-termine">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">{t("widget.titel")}</span>
        <Link to="/kalender" className="text-xs text-ca hover:underline">
          {t("widget.alle")}
        </Link>
      </div>
      {liste.length === 0 ? (
        <p className="text-xs text-text-tertiary">{t("widget.keine")}</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                  KATEGORIE_STIL[e.kategorie] ?? KATEGORIE_STIL.sonstiges
                }`}
                title={t(`kategorie.${e.kategorie}`)}
              >
                <TerminIcon eintrag={e} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text-primary">
                  {e.wichtig && "★ "}
                  {uebersetzt(e, "titel")}
                </div>
                <div className="text-xs text-text-secondary">{formatZeit(e, i18n.language)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
