/**
 * Regionen-Bericht (Release 31) : Kennzahlen je Region und gesamt für einen Zeitraum (Treffen,
 * Anmeldungen, Fans, Punkte) mit CSV-Export. Nur für Personenverwalter und Büro (`darf_berichte`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ladeBerichtCsv } from "../../api/regionen";
import { useBericht } from "../../hooks/useRegionen";
import type { Kennzahlen } from "../../types/regionen";

const FELD =
  "rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

const ZEILEN: ReadonlyArray<keyof Kennzahlen> = [
  "treffen",
  "geplant",
  "abgesagt",
  "anmeldungen",
  "anwesende",
  "anwesenheitsquote",
  "beitraege",
  "reaktionen",
  "fans_gesamt",
  "fans_mitglieder",
  "fans_ohne_mitgliedschaft",
  "fans_neu",
  "fans_aktiv",
  "fan_zu_mitglied",
  "punkte",
];

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

function jahresbeginn(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export default function BerichtPage() {
  const { t, i18n } = useTranslation("regionen");
  const [von, setVon] = useState(jahresbeginn);
  const [bis, setBis] = useState(heute);
  const [exportFehler, setExportFehler] = useState(false);
  const gueltig = Boolean(von) && Boolean(bis) && von <= bis;
  const { data, isLoading, isError } = useBericht(von, bis);

  async function exportieren() {
    setExportFehler(false);
    try {
      const blob = await ladeBerichtCsv({ von, bis });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `regionen-bericht-${von}-${bis}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportFehler(true);
    }
  }

  const wert = (k: Kennzahlen, feld: keyof Kennzahlen) => {
    const w = k[feld];
    if (w === null || w === undefined) return "–";
    if (feld === "anwesenheitsquote") return `${Number(w)} %`;
    return Number(w).toLocaleString(i18n.language);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to="/regionen" className="text-xs font-medium text-ca hover:underline">
          ← {t("zurueck")}
        </Link>
        <h1 className="mt-1 text-xl font-bold text-text-primary">{t("bericht.titel")}</h1>
        <p className="text-sm text-text-secondary">{t("bericht.einleitung")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-text-tertiary">
          {t("bericht.von")}
          <input
            type="date"
            className={`${FELD} mt-1 block`}
            value={von}
            onChange={(e) => setVon(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-text-tertiary">
          {t("bericht.bis")}
          <input
            type="date"
            className={`${FELD} mt-1 block`}
            value={bis}
            onChange={(e) => setBis(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!gueltig}
          onClick={exportieren}
          className="rounded-cid bg-ca px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t("bericht.export")}
        </button>
      </div>

      {!gueltig && <p className="text-sm text-status-dangerText">{t("bericht.zeitraum_falsch")}</p>}
      {exportFehler && (
        <p className="text-sm text-status-dangerText">{t("bericht.export_fehler")}</p>
      )}
      {gueltig && isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {gueltig && isError && (
        <p className="text-sm text-status-dangerText">{t("bericht.fehler_laden")}</p>
      )}

      {gueltig && data && (
        <div className="overflow-x-auto rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-tertiary">
              <tr>
                <th scope="col" className="py-2 pr-3">
                  {t("bericht.kennzahl")}
                </th>
                {data.regionen.map((r) => (
                  <th key={r.slug} scope="col" className="py-2 pr-3 text-right">
                    {r.name}
                  </th>
                ))}
                <th scope="col" className="py-2 text-right">
                  {t("bericht.gesamt")}
                </th>
              </tr>
            </thead>
            <tbody>
              {ZEILEN.map((feld) => (
                <tr key={feld} className="border-t border-text-tertiary/10">
                  <th scope="row" className="py-2 pr-3 font-medium text-text-primary">
                    {t(`bericht.zeile.${feld}`)}
                  </th>
                  {data.regionen.map((r) => (
                    <td key={r.slug} className="py-2 pr-3 text-right tabular-nums">
                      {wert(r, feld)}
                    </td>
                  ))}
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {wert(data.gesamt, feld)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-text-tertiary">{t("bericht.hinweis")}</p>
        </div>
      )}
    </div>
  );
}
