/**
 * Onglet "Pivot" — Statistiken & KPIs : dynamische, mehrdimensionale Auswertung der Buchungen
 * (Einnahmen + freigegebene Ausgaben). Je Achse bis zu drei Dimensionen, mehrere Kennzahlen
 * gleichzeitig (Einnahmen und Ausgaben getrennt, Saldo, Anzahl, Durchschnitt), Filter nach Art,
 * Kategorie und Gegenpartei. Die Tabelle zeigt Zeilen-/Spalten-/Gesamtsummen und lässt sich als
 * Excel oder CSV exportieren (gleiche Abfrage am Server).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { exporterPivot } from "../../api/stats";
import { usePivotOptionen, useStatsPivot } from "../../hooks/useStats";
import type {
  PivotAbfrage,
  PivotDimension,
  PivotKennzahl,
  PivotTypFilter,
} from "../../types/stats";
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
const KENNZAHLEN: PivotKennzahl[] = ["einnahmen", "ausgaben", "saldo", "anzahl", "durchschnitt"];
const MAX_DIMENSIONEN = 3;
const JAHR = new Date().getFullYear();

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const CHIP =
  "inline-flex items-center gap-1 rounded-full border border-text-tertiary/30 px-2.5 py-1 text-xs";

function format(wert: number, kennzahl: PivotKennzahl): string {
  if (kennzahl === "anzahl") return String(wert);
  return `${wert.toFixed(2).replace(".", ",")} €`;
}

interface AchseProps {
  id: string;
  titel: string;
  gewaehlt: PivotDimension[];
  verfuegbar: PivotDimension[];
  mindestens: number;
  onChange: (dims: PivotDimension[]) => void;
}

function AchsenAuswahl({ id, titel, gewaehlt, verfuegbar, mindestens, onChange }: AchseProps) {
  const { t } = useTranslation("stats");
  const frei = verfuegbar.filter((d) => !gewaehlt.includes(d));
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {titel}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {gewaehlt.map((d) => (
          <span key={d} className={`${CHIP} bg-bg-tertiary`}>
            {t(`pivot.dim_${d}`)}
            <button
              type="button"
              disabled={gewaehlt.length <= mindestens}
              aria-label={t("pivot.entfernen", { name: t(`pivot.dim_${d}`) })}
              onClick={() => onChange(gewaehlt.filter((x) => x !== d))}
              className="text-text-tertiary hover:text-text-primary disabled:opacity-30"
            >
              ×
            </button>
          </span>
        ))}
        <select
          id={id}
          value=""
          disabled={gewaehlt.length >= MAX_DIMENSIONEN || frei.length === 0}
          title={gewaehlt.length >= MAX_DIMENSIONEN ? t("pivot.max_hinweis") : undefined}
          onChange={(e) => {
            if (e.target.value) onChange([...gewaehlt, e.target.value as PivotDimension]);
          }}
          className={`${FELD} w-36 disabled:opacity-40`}
        >
          <option value="">{t("pivot.hinzufuegen")}</option>
          {frei.map((d) => (
            <option key={d} value={d}>
              {t(`pivot.dim_${d}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function OngletPivot() {
  const { t } = useTranslation("stats");
  const [abfrage, setAbfrage] = useState<PivotAbfrage>({
    zeilen: ["kategorie"],
    spalten: ["jahr"],
    kennzahlen: ["einnahmen", "ausgaben", "saldo"],
    jahr_von: JAHR - 2,
    jahr_bis: JAHR,
    typ: "",
    kategorie: [],
    gegenpartei: "",
  });
  const [gegenparteiEntwurf, setGegenparteiEntwurf] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const { data, isLoading, isError } = useStatsPivot(abfrage);
  const { data: optionen } = usePivotOptionen(abfrage.jahr_von, abfrage.jahr_bis);

  useEffect(() => {
    const timer = setTimeout(
      () => setAbfrage((alt) => ({ ...alt, gegenpartei: gegenparteiEntwurf })),
      400,
    );
    return () => clearTimeout(timer);
  }, [gegenparteiEntwurf]);

  function setze<K extends keyof PivotAbfrage>(schluessel: K, wert: PivotAbfrage[K]) {
    setAbfrage((alt) => ({ ...alt, [schluessel]: wert }));
  }

  function tauschen() {
    if (abfrage.spalten.length === 0) return;
    setAbfrage((alt) => ({ ...alt, zeilen: alt.spalten, spalten: alt.zeilen }));
  }

  function kennzahlUmschalten(k: PivotKennzahl) {
    setAbfrage((alt) => {
      const aktiv = alt.kennzahlen.includes(k);
      if (aktiv && alt.kennzahlen.length === 1) return alt;
      // Reihenfolge der Kennzahlen bleibt stabil (wie in KENNZAHLEN)
      const neu = KENNZAHLEN.filter((x) => (x === k ? !aktiv : alt.kennzahlen.includes(x)));
      return { ...alt, kennzahlen: neu };
    });
  }

  function kategorieUmschalten(name: string) {
    setAbfrage((alt) => ({
      ...alt,
      kategorie: alt.kategorie.includes(name)
        ? alt.kategorie.filter((x) => x !== name)
        : [...alt.kategorie, name],
    }));
  }

  function filterZuruecksetzen() {
    setGegenparteiEntwurf("");
    setAbfrage((alt) => ({ ...alt, typ: "", kategorie: [], gegenpartei: "" }));
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

  const filterAktiv =
    abfrage.typ !== "" || abfrage.kategorie.length > 0 || abfrage.gegenpartei !== "";
  const kz = data?.kennzahlen ?? abfrage.kennzahlen;
  const zeilen = data?.zeilen ?? [];
  const spalten = data?.spalten ?? [];
  // Schattierung je Kennzahl relativ zum größten Einzelwert dieser Kennzahl
  const maxima = kz.map((_, i) =>
    Math.max(1, ...zeilen.flatMap((z) => z.werte.map((w) => Math.abs(w[i] ?? 0)))),
  );
  const mitSpalten = spalten.length > 0;
  const kennzahlKopf = kz.length > 1 || !mitSpalten;
  const kopfLabel = (data?.zeilen_dims ?? abfrage.zeilen)
    .map((d) => t(`pivot.dim_${d}`))
    .join(" / ");

  function zelle(schluessel: string, wert: number, i: number, fett = false, schattiert = false) {
    const art = kz[i];
    const negativ = art === "saldo" && wert < 0;
    return (
      <td
        key={schluessel}
        className={`px-3 py-1.5 text-right tabular-nums ${fett ? "font-semibold" : ""} ${
          negativ ? "text-status-dangerText" : ""
        }`}
        style={{
          backgroundColor:
            schattiert && wert !== 0
              ? `rgba(204,0,0,${(0.04 + 0.16 * (Math.abs(wert) / maxima[i])).toFixed(3)})`
              : undefined,
        }}
      >
        {wert === 0 && art !== "saldo" ? "–" : format(wert, art)}
      </td>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-tertiary">{t("pivot.hinweis")}</p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <AchsenAuswahl
          id="pivot-zeilen"
          titel={t("pivot.zeilen")}
          gewaehlt={abfrage.zeilen}
          verfuegbar={DIMENSIONEN.filter((d) => !abfrage.spalten.includes(d))}
          mindestens={1}
          onChange={(dims) => setze("zeilen", dims)}
        />
        <button
          type="button"
          onClick={tauschen}
          disabled={abfrage.spalten.length === 0}
          title={t("pivot.tauschen")}
          aria-label={t("pivot.tauschen")}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm disabled:opacity-40"
        >
          ⇄
        </button>
        <AchsenAuswahl
          id="pivot-spalten"
          titel={t("pivot.spalten")}
          gewaehlt={abfrage.spalten}
          verfuegbar={DIMENSIONEN.filter((d) => !abfrage.zeilen.includes(d))}
          mindestens={0}
          onChange={(dims) => setze("spalten", dims)}
        />
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

      <div className="mb-3">
        <span className={LABEL}>{t("pivot.kennzahlen")}</span>
        <div className="flex flex-wrap gap-1.5">
          {KENNZAHLEN.map((k) => {
            const aktiv = abfrage.kennzahlen.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={aktiv}
                onClick={() => kennzahlUmschalten(k)}
                className={`${CHIP} ${
                  aktiv
                    ? "border-brand-red bg-brand-red/10 font-medium text-text-primary"
                    : "text-text-secondary hover:bg-bg-tertiary"
                }`}
              >
                {t(`pivot.kz_${k}`)}
              </button>
            );
          })}
        </div>
      </div>

      <fieldset className="mb-4 rounded-cid border border-text-tertiary/20 p-3">
        <legend className="px-1 text-[10px] uppercase text-text-tertiary">
          {t("pivot.filter")}
        </legend>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="pivot-filter-typ" className={LABEL}>
              {t("pivot.filter_typ")}
            </label>
            <select
              id="pivot-filter-typ"
              value={abfrage.typ}
              onChange={(e) => setze("typ", e.target.value as PivotTypFilter)}
              className={FELD}
            >
              <option value="">{t("pivot.filter_alle")}</option>
              <option value="einnahme">{t("pivot.filter_einnahmen")}</option>
              <option value="ausgabe">{t("pivot.filter_ausgaben")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="pivot-filter-gegenpartei" className={LABEL}>
              {t("pivot.filter_gegenpartei")}
            </label>
            <input
              id="pivot-filter-gegenpartei"
              type="text"
              value={gegenparteiEntwurf}
              onChange={(e) => setGegenparteiEntwurf(e.target.value)}
              className={`${FELD} w-48`}
            />
          </div>
          {filterAktiv && (
            <button
              type="button"
              onClick={filterZuruecksetzen}
              className="text-xs text-brand-red underline"
            >
              {t("pivot.filter_zuruecksetzen")}
            </button>
          )}
        </div>
        {optionen && optionen.kategorie.length > 0 && (
          <div className="mt-3">
            <span className={LABEL}>{t("pivot.filter_kategorie")}</span>
            <div className="flex flex-wrap gap-1.5">
              {optionen.kategorie.map((name) => {
                const aktiv = abfrage.kategorie.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={aktiv}
                    onClick={() => kategorieUmschalten(name)}
                    className={`${CHIP} ${
                      aktiv
                        ? "border-brand-red bg-brand-red/10 font-medium text-text-primary"
                        : "text-text-secondary hover:bg-bg-tertiary"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </fieldset>

      {fehler && <p className="mb-2 text-xs text-status-dangerText">{fehler}</p>}
      {isLoading && <p className="text-sm text-text-tertiary">{t("pivot.laedt")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("pivot.fehler")}</p>}

      {data && (
        <div className="overflow-x-auto rounded-cid border border-text-tertiary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-tertiary text-left text-xs uppercase text-text-tertiary">
                <th className="px-3 py-2" rowSpan={mitSpalten && kennzahlKopf ? 2 : 1}>
                  {kopfLabel}
                </th>
                {mitSpalten ? (
                  <>
                    {spalten.map((s) => (
                      <th
                        key={s.label}
                        colSpan={kz.length}
                        className="border-l border-text-tertiary/20 px-3 py-2 text-right"
                      >
                        {s.label}
                      </th>
                    ))}
                    <th
                      colSpan={kz.length}
                      className="border-l border-text-tertiary/20 px-3 py-2 text-right"
                    >
                      {t("pivot.summe")}
                    </th>
                  </>
                ) : (
                  kz.map((k) => (
                    <th key={k} className="px-3 py-2 text-right">
                      {t(`pivot.kz_${k}`)}
                    </th>
                  ))
                )}
              </tr>
              {mitSpalten && kennzahlKopf && (
                <tr className="bg-bg-tertiary text-left text-[10px] uppercase text-text-tertiary">
                  {[...spalten, null].flatMap((s) =>
                    kz.map((k, i) => (
                      <th
                        key={`${s?.label ?? "summe"}-${k}`}
                        className={`px-3 py-1 text-right ${i === 0 ? "border-l border-text-tertiary/20" : ""}`}
                      >
                        {t(`pivot.kz_${k}`)}
                      </th>
                    )),
                  )}
                </tr>
              )}
            </thead>
            <tbody>
              {zeilen.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-4 text-text-tertiary"
                    colSpan={(mitSpalten ? spalten.length + 1 : 1) * kz.length + 1}
                  >
                    {t("pivot.leer")}
                  </td>
                </tr>
              )}
              {zeilen.map((z) => (
                <tr key={z.label} className="border-t border-text-tertiary/10">
                  <td className="px-3 py-1.5">{z.label}</td>
                  {mitSpalten &&
                    z.werte.flatMap((spaltenWerte, si) =>
                      spaltenWerte.map((w, i) =>
                        zelle(`${spalten[si]?.label}-${i}`, w, i, false, true),
                      ),
                    )}
                  {z.summe.map((w, i) => zelle(`summe-${i}`, w, i, true))}
                </tr>
              ))}
            </tbody>
            {zeilen.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-text-tertiary/30 font-semibold">
                  <td className="px-3 py-2">{t("pivot.summe")}</td>
                  {mitSpalten &&
                    data.spalten_summen.flatMap((summen, si) =>
                      summen.map((w, i) => zelle(`${spalten[si]?.label}-${i}`, w, i, true)),
                    )}
                  {data.gesamt.map((w, i) => zelle(`gesamt-${i}`, w, i, true))}
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
