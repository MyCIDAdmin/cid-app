/**
 * Hilfe-Schaltfläche der Verwaltungsmodule (Demande utilisateur du 2026-10-06, point 4) :
 * "Hilfe-Button in den Verwaltungsmodulen, um zu erklären, wie mit dem Modul umzugehen ist".
 * Wird zentral in der Kopfleiste (AppLayout) eingehängt und erscheint nur auf Seiten, für die
 * ein Hilfetext existiert (HILFE_ROUTEN) — der Text liegt in public/locales/<lng>/help.json und
 * kann dort ohne Code-Änderung angepasst werden.
 *
 * Die Schaltfläche öffnet den Hilfe-Begleiter (HelpPanel.tsx) : ein Seitenpanel neben der App,
 * kein blockierendes Fenster. Man kann der Hilfe also folgen und gleichzeitig in der App arbeiten
 * (Retour du 2026-10-18 : "Schwierig, der Hilfe zu folgen und die Schritte direkt in der App
 * durchzuführen").
 */
import { IconHelp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { useHilfeStore } from "../../store/hilfeStore";
import { cleHilfe } from "./helpRoutes";

export default function HelpButton() {
  const { t } = useTranslation("help");
  const { pathname, search } = useLocation();
  const cle = cleHilfe(pathname, search);
  const offen = useHilfeStore((s) => s.offen);
  const umschalten = useHilfeStore((s) => s.umschalten);

  if (!cle) return null;

  return (
    <button
      type="button"
      onClick={() => umschalten(cle)}
      aria-label={t("bouton")}
      aria-pressed={offen}
      className="flex items-center gap-1.5 rounded-cid border border-text-tertiary/30 px-2.5 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-tertiary hover:text-text-primary aria-pressed:bg-bg-tertiary aria-pressed:text-text-primary"
    >
      <IconHelp size={16} />
      <span className="hidden sm:inline">{t("bouton")}</span>
    </button>
  );
}
