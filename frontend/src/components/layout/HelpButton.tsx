/**
 * Hilfe-Schaltfläche der Verwaltungsmodule (Demande utilisateur du 2026-10-06, point 4) :
 * "Hilfe-Button in den Verwaltungsmodulen, um zu erklären, wie mit dem Modul umzugehen ist".
 * Wird zentral in der Kopfleiste (AppLayout) eingehängt und erscheint nur auf Seiten, für die
 * ein Hilfetext existiert (HILFE_ROUTEN) — der Text liegt in public/locales/<lng>/help.json und
 * kann dort ohne Code-Änderung angepasst werden.
 *
 * Der Dialog wird per Portal in document.body gerendert: die Kopfleiste (.glass-bar) hat einen
 * backdrop-filter und wird dadurch zum Bezugsrahmen für `position: fixed`-Nachfahren — ohne Portal
 * klebte das Popup an der Kopfleiste (nach oben verrutscht, abgeschnitten).
 */
import { IconHelp, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { cleHilfe } from "./helpRoutes";

interface Workflow {
  titre: string;
  wann?: string;
  schritte: string[];
  beispiel?: string;
  danach?: string;
}

/** Ein Ablauf als aufklappbare Checkliste : Die Schritte lassen sich abhaken, ein Balken zeigt
 * den Fortschritt (nur Ansicht, nichts wird gespeichert). */
export function WorkflowKarte({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation("help");
  const [offen, setOffen] = useState(false);
  const [erledigt, setErledigt] = useState<boolean[]>(() => workflow.schritte.map(() => false));
  const anzahl = erledigt.filter(Boolean).length;
  const gesamt = workflow.schritte.length;
  const prozent = gesamt ? Math.round((100 * anzahl) / gesamt) : 0;

  return (
    <div className="rounded-cid border border-text-tertiary/20">
      <button
        type="button"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-text-primary"
      >
        <span>{workflow.titre}</span>
        <span aria-hidden="true" className="text-text-tertiary">
          {offen ? "−" : "+"}
        </span>
      </button>
      {offen && (
        <div className="space-y-3 border-t border-text-tertiary/10 px-3 py-3 text-sm">
          {workflow.wann && <p className="text-text-secondary">{workflow.wann}</p>}
          <div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={gesamt}
              aria-valuenow={anzahl}
              className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary"
            >
              <div className="h-full bg-ca transition-all" style={{ width: `${prozent}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-text-tertiary">
              <span>
                {anzahl === gesamt && gesamt > 0
                  ? t("alle_fertig")
                  : t("fortschritt", { done: anzahl, total: gesamt })}
              </span>
              {anzahl > 0 && (
                <button
                  type="button"
                  onClick={() => setErledigt(workflow.schritte.map(() => false))}
                  className="underline"
                >
                  {t("zuruecksetzen")}
                </button>
              )}
            </div>
          </div>
          <ol className="space-y-1.5">
            {workflow.schritte.map((schritt, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={erledigt[i] ?? false}
                    onChange={() =>
                      setErledigt((alt) => alt.map((wert, j) => (j === i ? !wert : wert)))
                    }
                    className="mt-0.5"
                  />
                  <span className={erledigt[i] ? "text-text-tertiary line-through" : ""}>
                    <span className="mr-1 font-semibold">{i + 1}.</span>
                    {schritt}
                  </span>
                </label>
              </li>
            ))}
          </ol>
          {workflow.beispiel && (
            <div className="rounded-cid bg-bg-tertiary/60 p-2.5 text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{t("beispiel")}: </span>
              {workflow.beispiel}
            </div>
          )}
          {workflow.danach && (
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{t("danach")} </span>
              {workflow.danach}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
  const abl = t(`${cle}.workflows`, { returnObjects: true }) as unknown;
  const workflows = Array.isArray(abl) ? (abl as Workflow[]) : [];
  const tp = t(`${cle}.tipps`, { returnObjects: true }) as unknown;
  const tipps = Array.isArray(tp) ? (tp as string[]) : [];

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
      {offen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setOffen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t(`${cle}.titre`)}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-cid-lg bg-bg-primary p-5 shadow-xl"
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
              {workflows.length > 0 && (
                <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
                  {t("ueberblick")}
                </h3>
              )}
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-primary">
                {liste.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {workflows.length > 0 && (
                <section className="mt-5">
                  <h3 className="text-xs font-bold uppercase text-text-tertiary">
                    {t("workflows")}
                  </h3>
                  <p className="mb-2 text-xs text-text-tertiary">{t("workflow_hinweis")}</p>
                  <div className="space-y-2">
                    {workflows.map((w) => (
                      <WorkflowKarte key={w.titre} workflow={w} />
                    ))}
                  </div>
                </section>
              )}
              {tipps.length > 0 && (
                <section className="mt-5">
                  <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
                    {t("tipps")}
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
                    {tipps.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
