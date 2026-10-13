/**
 * Ergebnisse einer Umfrage (Release 11): Balken je Antwortmöglichkeit, Freitext-Antworten und – nur
 * für die Verwaltung bei namentlichen Umfragen – wer was geantwortet hat.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { umfrageBericht, umfrageExcel } from "../../api/umfragen";
import { useUmfrageErgebnisse } from "../../hooks/useUmfragen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";
import { uebersetzt } from "../../utils/uebersetzung";
import { gruppiereNachThema } from "../../utils/umfragen";

export default function UmfrageErgebnisse({ umfrageId }: { umfrageId: string }) {
  const { t } = useTranslation("umfragen");
  const ergebnisse = useUmfrageErgebnisse(umfrageId, true);
  const [exportLaeuft, setExportLaeuft] = useState<"pdf" | "excel" | null>(null);
  const [exportFehler, setExportFehler] = useState("");

  async function exportieren(art: "pdf" | "excel") {
    setExportFehler("");
    setExportLaeuft(art);
    try {
      if (art === "pdf") {
        declencherTelechargement(await umfrageBericht(umfrageId), "umfrage-bericht.pdf");
      } else {
        declencherTelechargement(await umfrageExcel(umfrageId), "umfrage-ergebnisse.xlsx");
      }
    } catch (err) {
      setExportFehler(extractApiErrorMessage(err, t("ergebnisse.export_fehler")));
    } finally {
      setExportLaeuft(null);
    }
  }

  if (ergebnisse.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  }
  if (ergebnisse.isError || !ergebnisse.data) {
    return <p className="text-sm text-status-dangerText">{t("ergebnisse.fehler")}</p>;
  }
  const daten = ergebnisse.data;

  return (
    <section className="space-y-4" data-testid="umfrage-ergebnisse">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text-primary">{t("ergebnisse.titel")}</h2>
        <span className="flex flex-wrap gap-2">
          {(["pdf", "excel"] as const).map((art) => (
            <button
              key={art}
              type="button"
              onClick={() => exportieren(art)}
              disabled={exportLaeuft !== null}
              className="rounded-cid border border-ca px-3 py-1 text-xs font-medium text-ca disabled:opacity-50"
            >
              {exportLaeuft === art ? t("ergebnisse.export_laeuft") : t(`ergebnisse.${art}`)}
            </button>
          ))}
        </span>
      </div>
      {exportFehler && <p className="text-xs text-status-dangerText">{exportFehler}</p>}
      <p className="text-xs text-text-tertiary">
        {t("ergebnisse.teilnehmende", { count: daten.teilnehmende })}
      </p>

      {gruppiereNachThema(daten.fragen).map((gruppe) => (
        <section key={gruppe.thema} className="space-y-3">
          {gruppe.thema && (
            <h3 className="border-b border-text-tertiary/20 pb-1 text-sm font-bold text-ca">
              {uebersetzt(gruppe.fragen[0], "thema")}
            </h3>
          )}
          {gruppe.fragen.map((frage) => (
            <div key={frage.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
              <h4 className="mb-2 text-sm font-semibold text-text-primary">
                {uebersetzt(frage, "text")}
              </h4>
              {frage.optionen && (
                <ul className="space-y-2">
                  {frage.optionen.map((option) => (
                    <li key={option.id}>
                      <div className="mb-0.5 flex justify-between gap-2 text-xs text-text-secondary">
                        <span>{uebersetzt(option, "text")}</span>
                        <span className="tabular-nums">
                          {option.anzahl} · {option.anteil} %
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary">
                        <div
                          className="h-full rounded-full bg-ca"
                          style={{ width: `${option.anteil}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {frage.optionen && frage.freitexte && frage.freitexte.length > 0 && (
                <p className="mb-1 mt-3 text-[11px] font-bold uppercase text-text-tertiary">
                  {t("ergebnisse.kommentare")}
                </p>
              )}
              {frage.freitexte &&
                (frage.freitexte.length === 0 && !frage.optionen ? (
                  <p className="text-xs text-text-tertiary">{t("ergebnisse.keine_freitexte")}</p>
                ) : (
                  <ul className="space-y-1">
                    {frage.freitexte.map((text, index) => (
                      <li
                        key={index}
                        className="whitespace-pre-line rounded-cid bg-bg-secondary px-2 py-1 text-sm text-text-primary"
                      >
                        {text}
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          ))}
        </section>
      ))}

      {daten.einreichungen && (
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm" data-testid="umfrage-namen">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t("ergebnisse.wer_was")}
          </h3>
          {daten.einreichungen.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t("ergebnisse.keine_teilnahmen")}</p>
          ) : (
            <ul className="space-y-3">
              {daten.einreichungen.map((einreichung, index) => (
                <li key={index} className="text-sm">
                  <div className="font-medium text-text-primary">
                    {einreichung.name}{" "}
                    <span className="text-xs font-normal text-text-tertiary">
                      {einreichung.email}
                    </span>
                  </div>
                  <ul className="ml-3 list-disc text-xs text-text-secondary">
                    {einreichung.antworten.map((antwort) => (
                      <li key={antwort.frage}>
                        {antwort.frage}: {antwort.werte.join(", ")}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
