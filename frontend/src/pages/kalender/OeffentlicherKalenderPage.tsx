/**
 * Öffentlicher Kalender ohne Anmeldung (Release 15, z. B. zum Teilen oder für die Website) :
 * zeigt nur Termine mit Sichtbarkeit „öffentlich“ und öffentliche Veranstaltungen der nächsten
 * 90 Tage.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import TerminIcon from "../../components/kalender/TerminIcon";
import { useOeffentlicheEintraege } from "../../hooks/useKalender";
import { KATEGORIE_STIL, formatZeit } from "../../utils/kalender";
import { uebersetzt } from "../../utils/uebersetzung";

export default function OeffentlicherKalenderPage() {
  const { t, i18n } = useTranslation("kalender");
  const { von, bis } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { von: start, bis: new Date(start.getTime() + 90 * 24 * 3600 * 1000) };
  }, []);
  const eintraege = useOeffentlicheEintraege(von, bis);
  const liste = eintraege.data ?? [];

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-text-primary">{t("oeffentlich.titel")}</h1>
        <Link to="/login" className="text-sm text-ca underline">
          {t("oeffentlich.anmelden")}
        </Link>
      </header>
      {eintraege.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {eintraege.isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      {!eintraege.isLoading && !eintraege.isError && liste.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("oeffentlich.leer")}</p>
      )}
      <ul className="space-y-2">
        {liste.map((e) => (
          <li key={e.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  KATEGORIE_STIL[e.kategorie] ?? KATEGORIE_STIL.sonstiges
                }`}
              >
                <TerminIcon eintrag={e} size={13} />
                {t(`kategorie.${e.kategorie}`)}
              </span>
              <span className="text-sm font-semibold text-text-primary">
                {e.wichtig && "★ "}
                {uebersetzt(e, "titel")}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {formatZeit(e, i18n.language)}
              {e.ort ? ` · ${uebersetzt(e, "ort") || e.ort}` : ""}
            </p>
            {e.beschreibung && (
              <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
                {uebersetzt(e, "beschreibung")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
