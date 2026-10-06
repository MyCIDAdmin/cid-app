/**
 * Onglet "Pivot" — Statistiken & KPIs (Nutzerwunsch 2026-10-06) : dynamische, mehrdimensionale
 * Auswertung der Buchungen (Einnahmen + freigegebene Ausgaben). Zeilen, Spalten und Kennzahl
 * werden per Auswahl gewechselt ; die Tabelle zeigt Zeilen-/Spalten-/Gesamtsummen und lässt sich
 * als Excel oder CSV exportieren (gleiche Abfrage am Server).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exporterPivot } from "../../api/stats";
import { useStatsPivot } from "../../hooks/useStats";
import type { PivotAbfrage, PivotDimension, PivotKennzahl } from "../../types/stats";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";

const DIMENSIONEN: PivotDimension[] = [
  "jahr",
  "quartal",
  "monat",
  "typ",
  "kategorie",
  "gegenpartei",
];
const KENNZAHLEN: PivotKennzahl[] = ["betrag", "anzahl", "durchschnitt"];
const JAHR = new Date().getFullYear();

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

function format(wert: number, kennzahl: PivotKennzahl): string {
  if (kennzahl === "anzahl") return String(wert);
  return `${wert.toFixed(2).replace(".", ",")} €`;
}

export default function OngletPivot() {
  const { t } = useTranslation("stats");
  const [abfrage, setAbfrage] = useState<PivotAbfrage>({
    zeilen: "kategorie",
    spalten: "jahr",
    kennzahl: "betrag",
    jahr_von: JAHR - 2,
    jahr_bis: JAHR,
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const { data, isLoading, isError } = useStatsPivot(abfrage);

  function setze<K extends keyof PivotAbfrage>(schluessel: K, wert: PivotAbfrage[K]) {
    setAbfrage((alt) => ({ ...alt, [schluessel]: wert }));
  }

  function tauschen() {
    if (!abfrage.spalten) return;
    setAbfrage((alt) => ({ ...alt, zeilen: alt.spalten as PivotDimension, spalten: alt.zeilen }));
  }

  async function exportieren(datei: "xlsx" | "csv") {
    setFehler(null);
    try {
      const { blob, nomFichier } = await exporterPivot(abfrage, datei);
      declencherTelechargement(blob, nomFichier);
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("export.erreur")));
    }
  }

  const zeilen = data?.zeilen ?? [];
  const maximum = Math.max(1, ...zeilen.flatMap((z) => z.werte.map((w) => Math.abs(w))));

  return (
    <div>
      <p className="mb-3 text-xs text-text-tertiary">{t("pivot.hinweis")}</p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="pivot-zeilen" className={LABEL}>
            {t("pivot.zeilen")}
          </label>
          <select
            id="pivot-zeilen"
            value={abfrage.zeilen}
            onChange={(e) => setze("zeilen", e.target.value as PivotDimension)}
            className={FELD}
          >
            {DIMENSIONEN.map((d) => (
              <option key={d} value={d}>
                {t(`pivot.dim_${d}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={tauschen}
          disabled={!abfrage.spalten}
          title={t("pivot.tauschen")}
          aria-label={t("pivot.tauschen")}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm disabled:opacity-40"
        >
          ⇄
        </button>
        <div>
          <label htmlFor="pivot-spalten" className={LABEL}>
            {t("pivot.spalten")}
          </label>
          <select
            id="pivot-spalten"
            value={abfrage.spalten}
            onChange={(e) => setze("spalten", e.target.value as PivotDimension | "")}
            className={FELD}
          >
            <option value="">{t("pivot.keine")}</option>
            {DIMENSIONEN.filter((d) => d !== abfrage.zeilen).map((d) => (
              <option key={d} value={d}>
                {t(`pivot.dim_${d}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pivot-kennzahl" className={LABEL}>
            {t("pivot.kennzahl")}
          </label>
          <select
            id="pivot-kennzahl"
            value={abfrage.kennzahl}
            onChange={(e) => setze("kennzahl", e.target.value as PivotKennzahl)}
            className={FELD}
          >
            {KENNZAHLEN.map((k) => (
              <option key={k} value={k}>
                {t(`pivot.kz_${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pivot-von" className={LABEL}>
            {t("pivot.jahr_von")}
          </label>
          <input
            id="pivot-von"
            type="number"
            min={2000}
            max={abfrage.jahr_bis}
            value={abfrage.jahr_von}
            onChange={(e) => setze("jahr_von", Number(e.target.value) || JAHR)}
            className={`${FELD} w-24`}
          />
        </div>
        <div>
          <label htmlFor="pivot-bis" className={LABEL}>
            {t("pivot.jahr_bis")}
          </label>
          <input
            id="pivot-bis"
            type="number"
            min={abfrage.jahr_von}
            max={JAHR + 1}
            value={abfrage.jahr_bis}
            onChange={(e) => setze("jahr_bis", Number(e.target.value) || JAHR)}
            className={`${FELD} w-24`}
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => exportieren("xlsx")}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
          >
            {t("pivot.export_excel")}
          </button>
          <button
            type="button"
            onClick={() => exportieren("csv")}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
          >
            {t("pivot.export_csv")}
          </button>
        </div>
      </div>

      {fehler && <p className="mb-2 text-xs text-status-dangerText">{fehler}</p>}
      {isLoading && <p className="text-sm text-text-tertiary">{t("pivot.laedt")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("pivot.fehler")}</p>}

      {data && (
        <div className="overflow-x-auto rounded-cid border border-text-tertiary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-tertiary text-left text-xs uppercase text-text-tertiary">
                <th className="px-3 py-2">{t(`pivot.dim_${data.zeilen_dim}`)}</th>
                {data.spalten.map((s) => (
                  <th key={s} className="px-3 py-2 text-right">
                    {s}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">{t("pivot.summe")}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-text-tertiary" colSpan={data.spalten.length + 2}>
                    {t("pivot.leer")}
                  </td>
                </tr>
              )}
              {zeilen.map((z) => (
                <tr key={z.label} className="border-t border-text-tertiary/10">
                  <td className="px-3 py-1.5">{z.label}</td>
                  {z.werte.map((w, i) => (
                    <td
                      key={data.spalten[i]}
                      className="px-3 py-1.5 text-right tabular-nums"
                      style={{
                        backgroundColor:
                          w === 0
                            ? undefined
                            : `rgba(204,0,0,${(0.04 + 0.16 * (Math.abs(w) / maximum)).toFixed(3)})`,
                      }}
                    >
                      {w === 0 ? "–" : format(w, data.kennzahl)}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {format(z.summe, data.kennzahl)}
                  </td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-text-tertiary/30 font-semibold">
                  <td className="px-3 py-2">{t("pivot.summe")}</td>
                  {data.spalten_summen.map((w, i) => (
                    <td key={data.spalten[i]} className="px-3 py-2 text-right tabular-nums">
                      {format(w, data.kennzahl)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {format(data.gesamt, data.kennzahl)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {data && (
        <p className="mt-2 text-xs text-text-tertiary">
          {t("pivot.basis", { n: data.anzahl_buchungen })}
        </p>
      )}
    </div>
  );
}
