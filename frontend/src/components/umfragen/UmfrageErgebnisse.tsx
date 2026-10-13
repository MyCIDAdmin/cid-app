/**
 * Ergebnisse einer Umfrage (Release 11): Balken je Antwortmöglichkeit, Freitext-Antworten und – nur
 * für die Verwaltung bei namentlichen Umfragen – wer was geantwortet hat.
 */
import { useTranslation } from "react-i18next";

import { useUmfrageErgebnisse } from "../../hooks/useUmfragen";

export default function UmfrageErgebnisse({ umfrageId }: { umfrageId: string }) {
  const { t } = useTranslation("umfragen");
  const ergebnisse = useUmfrageErgebnisse(umfrageId, true);

  if (ergebnisse.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  }
  if (ergebnisse.isError || !ergebnisse.data) {
    return <p className="text-sm text-status-dangerText">{t("ergebnisse.fehler")}</p>;
  }
  const daten = ergebnisse.data;

  return (
    <section className="space-y-4" data-testid="umfrage-ergebnisse">
      <h2 className="text-base font-bold text-text-primary">{t("ergebnisse.titel")}</h2>
      <p className="text-xs text-text-tertiary">
        {t("ergebnisse.teilnehmende", { count: daten.teilnehmende })}
      </p>

      {daten.fragen.map((frage) => (
        <div key={frage.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">{frage.text}</h3>
          {frage.optionen && (
            <ul className="space-y-2">
              {frage.optionen.map((option) => (
                <li key={option.id}>
                  <div className="mb-0.5 flex justify-between gap-2 text-xs text-text-secondary">
                    <span>{option.text}</span>
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
          {frage.freitexte &&
            (frage.freitexte.length === 0 ? (
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
