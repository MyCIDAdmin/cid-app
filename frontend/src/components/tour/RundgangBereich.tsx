/**
 * Abschnitt „Rundgang“ im Hilfe-Begleiter : Rundgänge erneut ansehen und die einmaligen
 * Seitenhinweise wieder einblenden. Steht in jedem Hilfe-Panel, damit der Einstieg von jeder Seite
 * aus erreichbar ist.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { speichereTour, startTour } from "../../hooks/useTour";
import { useTourStationen } from "../../hooks/useTourStationen";

export default function RundgangBereich() {
  const { t } = useTranslation("tour");
  const { verfuegbar } = useTourStationen();
  const knopf =
    "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary";

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
        <button
          type="button"
          onClick={() => void speichereTour({ hinweise: [], hinweise_aus: false })}
          className={knopf}
        >
          {t("hilfe.hinweise")}
        </button>
      </div>
      <Link to="/hilfe/karten" className="block text-xs font-medium text-text-secondary underline">
        {t("hilfe.karten")}
      </Link>
    </section>
  );
}
