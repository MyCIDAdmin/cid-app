/**
 * Einmaliger Seitenhinweis (Variante „Leise Begleitung“ : Hinweisleiste oben auf der Seite). Er
 * erscheint beim ersten Besuch ausgewählter Seiten ; „Verstanden“ blendet genau diesen Hinweis
 * dauerhaft aus, „Alle Tipps ausblenden“ schaltet alle ab (unter Hilfe wieder einblendbar). Während
 * Willkommensfenster oder Rundgang sichtbar sind, bleibt die Leiste weg.
 */
import { IconBulb } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { NAV_ITEMS } from "../layout/Sidebar";
import { speichereTour, useTourMerker } from "../../hooks/useTour";
import { useTourStationen } from "../../hooks/useTourStationen";
import { useTourStore } from "../../store/tourStore";
import { hinweisSichtbar, hinweisTreffer, willkommenArten } from "../../utils/tour";
import HinweisZusatz from "./HinweisZusatz";

export default function HinweisLeiste() {
  const { t } = useTranslation("tour");
  const { pathname } = useLocation();
  const tour = useTourMerker();
  const { verfuegbar, bereit } = useTourStationen();
  const lauf = useTourStore((s) => s.lauf);
  const willkommenVerborgen = useTourStore((s) => s.willkommenVerborgen);

  const treffer = hinweisTreffer(pathname);
  if (!treffer || !bereit || lauf) return null;
  const { key } = treffer;
  const willkommenSichtbar =
    !willkommenVerborgen && willkommenArten(tour, verfuegbar, new Date()).length > 0;
  if (willkommenSichtbar || !hinweisSichtbar(tour, key)) return null;

  return (
    <aside
      aria-label={t("hinweis.label")}
      className="mb-4 flex flex-wrap items-start gap-3 rounded-cid border border-ca/40 bg-bg-primary p-3 text-sm shadow-sm"
    >
      <IconBulb size={18} className="mt-0.5 shrink-0 text-ca" aria-hidden="true" />
      <div className="min-w-[12rem] flex-1">
        <p className="font-semibold text-text-primary">{t(`hinweise.${key}.titel`)}</p>
        <p className="text-text-secondary">{t(`hinweise.${key}.text`)}</p>
        <HinweisZusatz
          hinweisKey={key}
          pageSlug={NAV_ITEMS.find((i) => i.to === treffer.pfad)?.pageSlug}
        />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => void speichereTour({ hinweise_aus: true })}
          className="text-xs font-medium text-text-secondary underline hover:text-text-primary"
        >
          {t("hinweis.alle_aus")}
        </button>
        <button
          type="button"
          onClick={() => void speichereTour({ hinweise: [...(tour?.hinweise ?? []), key] })}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {t("hinweis.verstanden")}
        </button>
      </div>
    </aside>
  );
}
