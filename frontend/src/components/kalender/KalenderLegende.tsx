/** Legende der Terminarten (Icon + Farbe + Name) unter dem Kalender. */
import { useTranslation } from "react-i18next";

import { KATEGORIEN } from "../../types/kalender";
import { KATEGORIE_STIL } from "../../utils/kalender";
import { KATEGORIE_ICON } from "../../utils/terminIcon";

export default function KalenderLegende() {
  const { t } = useTranslation("kalender");
  return (
    <ul
      aria-label={t("legende.titel")}
      className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-secondary"
      data-testid="kalender-legende"
    >
      {KATEGORIEN.map((k) => {
        const Symbol = KATEGORIE_ICON[k];
        return (
          <li key={k} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded ${KATEGORIE_STIL[k]}`}
            >
              <Symbol size={12} stroke={2} aria-hidden="true" />
            </span>
            {t(`kategorie.${k}`)}
          </li>
        );
      })}
    </ul>
  );
}
