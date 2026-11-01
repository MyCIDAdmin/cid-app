/**
 * Abschnitt „Rundgang“ im Hilfe-Begleiter : Rundgänge erneut ansehen und die einmaligen
 * Seitenhinweise wieder einblenden. Steht in jedem Hilfe-Panel, damit der Einstieg von jeder Seite
 * aus erreichbar ist.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { speichereTour, startTour, useTourMerker } from "../../hooks/useTour";
import { useTourStationen } from "../../hooks/useTourStationen";
import { GRUPPEN_RUNDGAENGE, hinweisFuerPfad } from "../../utils/tour";

export default function RundgangBereich() {
  const { t } = useTranslation("tour");
  const { verfuegbar, gruppen } = useTourStationen();
  const { pathname } = useLocation();
  const tour = useTourMerker();
  const [meldung, setMeldung] = useState<string | null>(null);
  const knopf =
    "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary";

  // Das Einblenden ist nur auf Seiten mit Tipp sichtbar ; deshalb bestätigt der Knopf, was geschah.
  const hinweiseEinblenden = () => {
    const warAus = Boolean(tour?.hinweise_aus) || (tour?.hinweise?.length ?? 0) > 0;
    void speichereTour({ hinweise: [], hinweise_aus: false });
    if (!warAus) setMeldung(t("hilfe.hinweise_schon"));
    else if (hinweisFuerPfad(pathname)) setMeldung(t("hilfe.hinweise_hier"));
    else setMeldung(t("hilfe.hinweise_an"));
  };

  return (
    <section
      aria-labelledby="hilfe-rundgang"
      className="space-y-2 border-t border-text-tertiary/10 pt-3"
    >
      <h3 id="hilfe-rundgang" className="text-xs font-bold uppercase text-text-tertiary">
        {t("hilfe.titel")}
      </h3>
      <p className="text-xs text-text-secondary">{t("hilfe.text")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => startTour("app")} className={knopf}>
          {t("hilfe.app")}
        </button>
        {verfuegbar.includes("verwaltung") && (
          <button type="button" onClick={() => startTour("verwaltung")} className={knopf}>
            {t("hilfe.verwaltung")}
          </button>
        )}
        <button type="button" onClick={hinweiseEinblenden} className={knopf}>
          {t("hilfe.hinweise")}
        </button>
      </div>
      <p role="status" className="min-h-[1rem] text-xs font-medium text-text-primary">
        {meldung}
      </p>
      {GRUPPEN_RUNDGAENGE.some((g) => gruppen[g]) && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-text-secondary">{t("hilfe.gruppen_titel")}</p>
          <div className="flex flex-wrap gap-2">
            {GRUPPEN_RUNDGAENGE.filter((g) => gruppen[g]).map((g) => (
              <button key={g} type="button" onClick={() => startTour(g)} className={knopf}>
                {t(`hilfe.gruppen.${g}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <Link to="/hilfe/karten" className="block text-xs font-medium text-text-secondary underline">
        {t("hilfe.karten")}
      </Link>
    </section>
  );
}
