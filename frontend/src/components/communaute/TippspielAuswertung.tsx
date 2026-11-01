/**
 * Auswertung des Tippspiels (Fan-Club-Umbau 2026-11, Vorschlag B) : Rangliste mit Podium, Trend
 * und exakten Treffern (Gesamt / Letzter Spieltag), Spieltags-Matrix und Tipp-Wand.
 *
 * Alles kommt aus EINEM Aufruf (`useTippspielMatrix`). Welche Tipps sichtbar sind, entscheidet
 * der Server : erst nach der Sperre (1 Tag vor Anpfiff) und nur für bestätigte Teilnehmer und den
 * Administrator App (`tipps_sichtbar`). Namen kommen als „Vorname I.“.
 *
 * Ohne Matrix-Daten (Laden, Fehler) fällt die Rangliste auf die bisherige Tabelle der
 * Teilnahmen zurück, damit der Reiter nie leer bleibt.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useTippspielMatrix } from "../../hooks/useCommunaute";
import type {
  MatrixSpalte,
  MatrixZeile,
  TippspielMatrix,
  TippspielTeilnahme,
} from "../../types/communaute";
import { EQUIPE_SUIVIE, tendenzVerteilung, tippGruppen } from "../../utils/fanclub";

type Ansicht = "rangliste" | "matrix" | "wand";
type Zeitraum = "gesamt" | "letzter";

const ANSICHTEN: Ansicht[] = ["rangliste", "matrix", "wand"];

const PUNKTE_STIL: Record<number, string> = {
  4: "bg-status-successBg text-status-successText",
  2: "bg-status-infoBg text-status-infoText",
  1: "bg-status-warningBg text-status-warningText",
  0: "bg-bg-secondary text-text-tertiary",
};

function gegnerVon(spalte: MatrixSpalte): { name: string; heim: boolean } {
  const heim = spalte.equipe_domicile === EQUIPE_SUIVIE;
  return { name: heim ? spalte.equipe_exterieur : spalte.equipe_domicile, heim };
}

function ergebnisText(spalte: MatrixSpalte): string {
  return spalte.score_domicile === null || spalte.score_exterieur === null
    ? "–"
    : `${spalte.score_domicile}:${spalte.score_exterieur}`;
}

function TrendPfeil({ zeile }: { zeile: MatrixZeile }) {
  const { t } = useTranslation("communaute");
  if (zeile.rang_vorher === null) return <span className="text-text-tertiary">·</span>;
  const delta = zeile.rang_vorher - zeile.rang;
  if (delta === 0) return <span className="text-text-tertiary">·</span>;
  const hoch = delta > 0;
  return (
    <span
      className={`text-[11px] font-bold tabular-nums ${
        hoch ? "text-status-successText" : "text-status-dangerText"
      }`}
      title={t(hoch ? "tippspiel.trend_hoch" : "tippspiel.trend_runter", {
        anzahl: Math.abs(delta),
      })}
    >
      {hoch ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

function Podium({ zeilen }: { zeilen: { zeile: MatrixZeile; wert: number }[] }) {
  const { t } = useTranslation("communaute");
  const top = zeilen.slice(0, 3);
  if (top.length === 0) return null;
  // Mitte = Platz 1, links Platz 2, rechts Platz 3 (klassische Podium-Anordnung).
  const reihenfolge = [top[1], top[0], top[2]].filter(Boolean);
  const hoehe = ["h-16", "h-24", "h-12"];
  return (
    <ol
      className="flex items-end justify-center gap-2 px-3 pb-2 pt-3"
      aria-label={t("tippspiel.podium_label")}
      data-testid="tippspiel-podium"
    >
      {reihenfolge.map((eintrag) => {
        const platz = top.indexOf(eintrag) + 1;
        return (
          <li
            key={eintrag.zeile.name + platz}
            className="flex w-1/3 max-w-[8rem] flex-col items-center"
          >
            <span className="max-w-full truncate text-xs font-bold text-text-primary">
              {eintrag.zeile.name}
            </span>
            <span className="text-[11px] tabular-nums text-text-tertiary">
              {t("tippspiel.punkte_kurz", { punkte: eintrag.wert })}
            </span>
            <span
              className={`mt-1 flex w-full items-start justify-center rounded-t-cid pt-1 text-sm font-bold ${
                hoehe[reihenfolge.indexOf(eintrag)]
              } ${platz === 1 ? "bg-ca text-white" : "bg-bg-secondary text-text-secondary"}`}
            >
              {platz}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Rangliste({ matrix }: { matrix: TippspielMatrix }) {
  const { t } = useTranslation("communaute");
  const [zeitraum, setZeitraum] = useState<Zeitraum>("gesamt");
  const hatLetzten = matrix.letztes_spiel !== null;

  const geordnet = useMemo(() => {
    if (zeitraum === "gesamt" || !hatLetzten) {
      return matrix.zeilen.map((zeile) => ({ zeile, wert: zeile.punkte }));
    }
    return matrix.zeilen
      .map((zeile) => ({ zeile, wert: zeile.letzte_punkte ?? 0 }))
      .sort((a, b) => b.wert - a.wert || a.zeile.rang - b.zeile.rang);
  }, [matrix.zeilen, zeitraum, hatLetzten]);

  return (
    <div>
      {hatLetzten && (
        <div
          className="flex gap-1 px-3 pt-2"
          role="group"
          aria-label={t("tippspiel.zeitraum_label")}
        >
          {(["gesamt", "letzter"] as const).map((wert) => (
            <button
              key={wert}
              type="button"
              aria-pressed={zeitraum === wert}
              onClick={() => setZeitraum(wert)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                zeitraum === wert
                  ? "bg-ca text-white"
                  : "bg-bg-secondary text-text-tertiary hover:text-text-primary"
              }`}
            >
              {t(`tippspiel.zeitraum_${wert}`)}
            </button>
          ))}
        </div>
      )}
      <Podium zeilen={geordnet} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("tippspiel.klassement_platz")}</th>
              <th className="w-8 px-1 py-2" aria-label={t("tippspiel.trend_label")} />
              <th className="px-3 py-2">{t("tippspiel.klassement_mitglied")}</th>
              <th className="px-2 py-2 text-center">{t("tippspiel.exakt_kurz")}</th>
              <th className="px-3 py-2 text-right">{t("tippspiel.klassement_punkte")}</th>
            </tr>
          </thead>
          <tbody>
            {geordnet.map(({ zeile, wert }, index) => (
              <tr
                key={`${zeile.name}-${index}`}
                className={`border-t border-text-tertiary/10 ${
                  zeile.ist_ich ? "bg-cal/40 font-bold text-cad" : "text-text-primary"
                }`}
              >
                <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                <td className="px-1 py-2">
                  {zeitraum === "gesamt" ? <TrendPfeil zeile={zeile} /> : null}
                </td>
                <td className="px-3 py-2">
                  {zeile.name}
                  {zeile.ist_ich && (
                    <span className="ml-1 text-[10px] font-normal text-text-tertiary">
                      ({t("tippspiel.du")})
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{zeile.exakt}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{wert}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SichtbarkeitsHinweis() {
  const { t } = useTranslation("communaute");
  return (
    <p className="px-3 py-3 text-sm text-text-tertiary" data-testid="tipps-nicht-sichtbar">
      {t("tippspiel.tipps_nur_teilnehmer")}
    </p>
  );
}

function Matrix({ matrix }: { matrix: TippspielMatrix }) {
  const { t } = useTranslation("communaute");
  if (!matrix.tipps_sichtbar) return <SichtbarkeitsHinweis />;
  if (matrix.spalten.length === 0) {
    return <p className="px-3 py-3 text-sm text-text-tertiary">{t("tippspiel.matrix_leer")}</p>;
  }
  return (
    <div>
      <p className="px-3 pt-2 text-[11px] text-text-tertiary">{t("tippspiel.matrix_hinweis")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm" data-testid="tippspiel-matrix">
          <thead>
            <tr className="align-bottom text-[10px] uppercase text-text-tertiary">
              <th className="sticky left-0 bg-bg-primary px-3 py-2 text-left">
                {t("tippspiel.klassement_mitglied")}
              </th>
              {matrix.spalten.map((spalte) => {
                const gegner = gegnerVon(spalte);
                return (
                  <th key={spalte.id} className="px-1 py-2 text-center font-medium">
                    <span
                      className="block max-w-[5.5rem] truncate"
                      title={`${spalte.equipe_domicile} – ${spalte.equipe_exterieur}`}
                    >
                      {gegner.name}
                    </span>
                    <span className="block normal-case">
                      {gegner.heim ? t("tippspiel.heim_kurz") : t("tippspiel.auswaerts_kurz")}
                      {" · "}
                      {ergebnisText(spalte)}
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right">{t("tippspiel.klassement_punkte")}</th>
            </tr>
          </thead>
          <tbody>
            {matrix.zeilen.map((zeile) => (
              <tr
                key={`${zeile.rang}-${zeile.name}`}
                className={`border-t border-text-tertiary/10 ${zeile.ist_ich ? "bg-cal/40" : ""}`}
              >
                <th
                  scope="row"
                  className={`sticky left-0 px-3 py-1.5 text-left font-medium ${
                    zeile.ist_ich ? "bg-cal text-cad" : "bg-bg-primary text-text-primary"
                  }`}
                >
                  <span className="mr-1.5 text-[10px] tabular-nums text-text-tertiary">
                    {zeile.rang}
                  </span>
                  {zeile.name}
                </th>
                {matrix.spalten.map((spalte) => {
                  const tipp = zeile.tipps[spalte.id];
                  if (!tipp) {
                    return (
                      <td key={spalte.id} className="px-1 py-1.5 text-center text-text-tertiary">
                        –
                      </td>
                    );
                  }
                  const stil = tipp.p === null ? "" : (PUNKTE_STIL[tipp.p] ?? PUNKTE_STIL[0]);
                  return (
                    <td key={spalte.id} className="px-1 py-1.5 text-center">
                      <span
                        className={`inline-block min-w-[2.75rem] rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${stil}`}
                        title={
                          tipp.p === null
                            ? undefined
                            : t("tippspiel.punkte_kurz", { punkte: tipp.p })
                        }
                      >
                        {tipp.d}:{tipp.e}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-bold tabular-nums">{zeile.punkte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul
        className="flex flex-wrap gap-x-3 gap-y-1 border-t border-text-tertiary/10 px-3 py-2 text-[11px] text-text-tertiary"
        aria-label={t("tippspiel.legende_label")}
      >
        {[4, 2, 1, 0].map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PUNKTE_STIL[p]}`}>
              {p}
            </span>
            {t("tippspiel.punkte_kurz", { punkte: p })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tippwand({ matrix }: { matrix: TippspielMatrix }) {
  const { t } = useTranslation("communaute");
  const neueste = matrix.spalten[matrix.spalten.length - 1]?.id ?? "";
  const [gewaehlt, setGewaehlt] = useState("");
  if (!matrix.tipps_sichtbar) return <SichtbarkeitsHinweis />;
  if (matrix.spalten.length === 0) {
    return <p className="px-3 py-3 text-sm text-text-tertiary">{t("tippspiel.matrix_leer")}</p>;
  }
  const spielId = matrix.spalten.some((s) => s.id === gewaehlt) ? gewaehlt : neueste;
  const spalte = matrix.spalten.find((s) => s.id === spielId) as MatrixSpalte;
  const tipps = matrix.zeilen.flatMap((zeile) => {
    const tipp = zeile.tipps[spielId];
    return tipp ? [{ name: zeile.name, d: tipp.d, e: tipp.e }] : [];
  });
  const gruppen = tippGruppen(tipps);
  const verteilung = tendenzVerteilung(tipps);
  const gegner = gegnerVon(spalte);

  return (
    <div className="space-y-3 p-3">
      <label className="block text-xs font-medium text-text-secondary">
        {t("tippspiel.wand_spiel_waehlen")}
        <select
          value={spielId}
          onChange={(e) => setGewaehlt(e.target.value)}
          className="mt-1 block w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
        >
          {[...matrix.spalten].reverse().map((s) => (
            <option key={s.id} value={s.id}>
              {s.equipe_domicile} – {s.equipe_exterieur} ({ergebnisText(s)})
            </option>
          ))}
        </select>
      </label>

      {tipps.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("tippspiel.wand_keine_tipps")}</p>
      ) : (
        <>
          <div>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-bg-secondary"
              role="img"
              aria-label={t("tippspiel.verteilung_label", {
                heim: verteilung.heim,
                remis: verteilung.remis,
                gast: verteilung.gast,
              })}
            >
              <span className="bg-ca" style={{ width: `${verteilung.heim}%` }} />
              <span className="bg-text-tertiary/50" style={{ width: `${verteilung.remis}%` }} />
              <span className="bg-status-infoText" style={{ width: `${verteilung.gast}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {t("tippspiel.verteilung_text", {
                heim: verteilung.heim,
                remis: verteilung.remis,
                gast: verteilung.gast,
                gegner: gegner.name,
              })}
            </p>
          </div>
          <ul className="space-y-2" data-testid="tippwand">
            {gruppen.map((gruppe) => (
              <li
                key={gruppe.ergebnis}
                className="flex items-start gap-3 rounded-cid-lg border border-text-tertiary/15 p-2"
              >
                <span className="rounded bg-bg-secondary px-2 py-1 text-sm font-bold tabular-nums text-text-primary">
                  {gruppe.ergebnis.replace(":", " : ")}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-xs font-bold text-text-secondary">
                    {t("tippspiel.wand_anzahl", { count: gruppe.anzahl })}
                  </p>
                  <p className="text-text-primary">{gruppe.namen.join(", ")}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function LegacyRangliste({ classement }: { classement: TippspielTeilnahme[] }) {
  const { t } = useTranslation("communaute");
  if (classement.length === 0) {
    return (
      <p className="px-3 pb-3 pt-1 text-sm text-text-tertiary">{t("tippspiel.klassement_leer")}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase text-text-tertiary">
            <th className="px-3 py-2">{t("tippspiel.klassement_platz")}</th>
            <th className="px-3 py-2">{t("tippspiel.klassement_mitglied")}</th>
            <th className="px-3 py-2 text-right">{t("tippspiel.klassement_punkte")}</th>
          </tr>
        </thead>
        <tbody>
          {classement.map((ligne, index) => (
            <tr key={ligne.id} className="border-t border-text-tertiary/10">
              <td className="px-3 py-2 tabular-nums">{index + 1}</td>
              <td className="px-3 py-2">{ligne.membre_nom}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{ligne.total_points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TippspielAuswertung({
  tippspielId,
  classement,
}: {
  tippspielId: string;
  /** Bisherige Rangliste (Fallback, solange die Matrix nicht geladen ist). */
  classement: TippspielTeilnahme[];
}) {
  const { t } = useTranslation("communaute");
  const [ansicht, setAnsicht] = useState<Ansicht>("rangliste");
  const matrixQuery = useTippspielMatrix(tippspielId);
  const matrix = matrixQuery.data;

  return (
    <div className="rounded-cid-lg bg-bg-primary shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <h3 className="text-xs font-bold uppercase text-text-tertiary">
          {t(matrix ? "tippspiel.auswertung_titel" : "tippspiel.klassement_titel")}
        </h3>
        {matrix && (
          <div className="flex gap-1" role="tablist" aria-label={t("tippspiel.auswertung_label")}>
            {ANSICHTEN.map((wert) => (
              <button
                key={wert}
                type="button"
                role="tab"
                aria-selected={ansicht === wert}
                onClick={() => setAnsicht(wert)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  ansicht === wert
                    ? "bg-ca text-white"
                    : "bg-bg-secondary text-text-tertiary hover:text-text-primary"
                }`}
              >
                {t(`tippspiel.ansicht_${wert}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!matrix || matrix.zeilen.length === 0 ? (
        <LegacyRangliste classement={classement} />
      ) : ansicht === "rangliste" ? (
        <Rangliste matrix={matrix} />
      ) : ansicht === "matrix" ? (
        <Matrix matrix={matrix} />
      ) : (
        <Tippwand matrix={matrix} />
      )}
    </div>
  );
}
