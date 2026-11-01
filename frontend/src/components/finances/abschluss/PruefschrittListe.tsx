import { useTranslation } from "react-i18next";

import type { PruefPunkt, PruefZiel } from "../../../types/finances";
import { euro } from "../../../utils/finanzen";
import { HilfeHinweis } from "../Erklaerung";

/** Schritt 1: automatische Prüfliste. Pflicht blockiert den Abschluss, Empfohlen ist ein Hinweis. */
export default function PruefschrittListe({
  punkte,
  onGoto,
}: {
  punkte: PruefPunkt[];
  onGoto: (ziel: PruefZiel) => void;
}) {
  const { t, i18n } = useTranslation("finances");
  const offen = punkte.filter((p) => !p.ok);
  const ok = punkte.filter((p) => p.ok);
  return (
    <section aria-label={t("assistent.schritte.aufraeumen")}>
      <p className="mb-3 text-xs text-text-tertiary">{t("assistent.pruef.intro")}</p>
      {offen.length === 0 ? (
        <p className="mb-3 rounded-cid bg-status-successBg px-3 py-2 text-sm text-status-successText">
          {t("assistent.pruef.alles_ok")}
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {offen.map((p) => (
            <li
              key={p.id}
              className={`rounded-cid-lg border-l-4 bg-bg-primary p-3 shadow-sm ${
                p.stufe === "pflicht" ? "border-status-dangerText" : "border-status-warningText"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                    {t(`assistent.pruef.${p.id}.titel`, {
                      anzahl: p.anzahl,
                      betrag: euro(p.betrag, i18n.language),
                    })}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.stufe === "pflicht"
                          ? "bg-status-dangerBg text-status-dangerText"
                          : "bg-status-warningBg text-status-warningText"
                      }`}
                    >
                      {t(`assistent.stufe.${p.stufe}`)}
                    </span>
                  </p>
                  <p className="text-xs text-text-secondary">{t(`assistent.pruef.${p.id}.text`)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onGoto(p.ziel)}
                  className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
                >
                  {t("assistent.pruef.ansehen")}
                </button>
              </div>
              <HilfeHinweis>{t(`assistent.pruef.${p.id}.hilfe`)}</HilfeHinweis>
            </li>
          ))}
        </ul>
      )}
      {ok.length > 0 && (
        <details className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <summary className="cursor-pointer text-xs font-semibold text-text-secondary">
            {t("assistent.pruef.bestanden", { n: ok.length })}
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-text-secondary">
            {ok.map((p) => (
              <li key={p.id}>✓ {t(`assistent.pruef_ok.${p.id}`)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
