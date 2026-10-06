/**
 * Hilfe-Schaltfläche der Verwaltungsmodule (Demande utilisateur du 2026-10-06, point 4) :
 * "Hilfe-Button in den Verwaltungsmodulen, um zu erklären, wie mit dem Modul umzugehen ist".
 * Wird zentral in der Kopfleiste (AppLayout) eingehängt und erscheint nur auf Seiten, für die
 * ein Hilfetext existiert (HILFE_ROUTEN) — der Text liegt in public/locales/<lng>/help.json und
 * kann dort ohne Code-Änderung angepasst werden.
 */
import { IconHelp, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { cleHilfe } from "./helpRoutes";

export default function HelpButton() {
  const { t } = useTranslation("help");
  const { pathname } = useLocation();
  const [offen, setOffen] = useState(false);
  const cle = cleHilfe(pathname);

  useEffect(() => {
    setOffen(false);
  }, [pathname]);

  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOffen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offen]);

  if (!cle) return null;
  const schritte = t(`${cle}.schritte`, { returnObjects: true }) as unknown;
  const liste = Array.isArray(schritte) ? (schritte as string[]) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        aria-label={t("bouton")}
        className="flex items-center gap-1.5 rounded-cid border border-text-tertiary/30 px-2.5 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-tertiary hover:text-text-primary"
      >
        <IconHelp size={16} />
        <span className="hidden sm:inline">{t("bouton")}</span>
      </button>
      {offen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOffen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t(`${cle}.titre`)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-text-primary">{t(`${cle}.titre`)}</h2>
              <button
                type="button"
                onClick={() => setOffen(false)}
                aria-label={t("fermer")}
                className="rounded-cid p-1 text-text-tertiary hover:bg-bg-tertiary"
              >
                <IconX size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-text-secondary">{t(`${cle}.intro`)}</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-primary">
              {liste.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
