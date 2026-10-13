/** Dashboard-Kachel „Nächste Termine“ (Release 15) : die kommenden Einträge des Vereinskalenders. */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useKalenderEintraege } from "../../hooks/useKalender";
import { formatZeit } from "../../utils/kalender";
import { uebersetzt } from "../../utils/uebersetzung";

export default function NaechsteTermine() {
  const { t, i18n } = useTranslation("kalender");
  const { von, bis } = useMemo(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    return { von: start, bis: new Date(start.getTime() + 45 * 24 * 3600 * 1000) };
  }, []);
  const eintraege = useKalenderEintraege("verein", von, bis);
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
            <li key={e.id} className="text-sm">
              <div className="truncate font-medium text-text-primary">
                {e.wichtig && "★ "}
                {uebersetzt(e, "titel")}
              </div>
              <div className="text-xs text-text-secondary">{formatZeit(e, i18n.language)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
