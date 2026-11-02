import { useTranslation } from "react-i18next";

import type { Probelauf } from "../../../types/finances";
import { euro, euroSigniert, prozentVon } from "../../../utils/finanzen";
import { Fachwort, HilfeHinweis } from "../Erklaerung";

export interface Annahmen {
  offeneAusgaben: boolean;
  offeneBeitraege: boolean;
}

function Veraenderung({
  jetzt,
  vorher,
  besserWennNiedriger = false,
}: {
  jetzt: string;
  vorher: string;
  besserWennNiedriger?: boolean;
}) {
  const { t, i18n } = useTranslation("finances");
  const diff = Number(jetzt) - Number(vorher);
  const gut = besserWennNiedriger ? diff <= 0 : diff >= 0;
  return (
    <span className={`text-xs ${gut ? "text-status-successText" : "text-status-dangerText"}`}>
      {t("assistent.probelauf.zum_vorjahr", {
        diff: euroSigniert(diff, i18n.language),
        prozent: `${diff >= 0 ? "+" : "−"}${Math.abs(prozentVon(diff, vorher))}`,
      })}
    </span>
  );
}

/** Schritt 2: Zahlen des Jahres im Vorjahresvergleich, „Was wäre wenn?“ rechnet nur probehalber. */
export default function ProbelaufSchritt({
  daten,
  echt,
  annahmen,
  onAnnahmen,
}: {
  daten: Probelauf;
  /** Probelauf ohne Annahmen: bestimmt, ob es überhaupt etwas Offenes zum Einrechnen gibt. */
  echt: Probelauf;
  annahmen: Annahmen;
  onAnnahmen: (a: Annahmen) => void;
}) {
  const { t, i18n } = useTranslation("finances");
  const punkt = (id: string) => echt.pruefliste.find((p) => p.id === id);
  const offeneAusgaben = punkt("freigaben");
  const offeneBeitraege = punkt("beitraege");
  const sp = i18n.language;
  const maximum = Math.max(
    Number(daten.einnahmen.total),
    Number(daten.einnahmen.total_vorjahr),
    Number(daten.ausgaben.total),
    Number(daten.ausgaben.total_vorjahr),
    1,
  );
  const balken = (label: string, wert: string, vorjahr: string, farbe: string) => (
    <div className="grid grid-cols-[90px_1fr_80px] items-center gap-2 text-xs sm:grid-cols-[110px_1fr_90px]">
      <span className="text-text-secondary">{label}</span>
      <div
        role="img"
        aria-label={t("assistent.probelauf.balken_label", {
          label,
          wert: euro(wert, sp),
          vorjahr: euro(vorjahr, sp),
        })}
        className="relative h-4 rounded bg-bg-tertiary"
      >
        <div
          className={`absolute inset-y-0 left-0 rounded ${farbe}`}
          style={{ width: `${(Number(wert) / maximum) * 100}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded border-2 border-text-tertiary"
          style={{ width: `${(Number(vorjahr) / maximum) * 100}%` }}
        />
      </div>
      <b className="text-right tabular-nums text-text-primary">{euro(wert, sp)}</b>
    </div>
  );

  return (
    <section aria-label={t("assistent.schritte.probelauf")} className="space-y-3">
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-text-primary">
          {t("assistent.probelauf.wenn_titel")}
        </h2>
        <p className="mb-3 text-xs text-text-tertiary">{t("assistent.probelauf.wenn_intro")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className={`flex items-start gap-3 rounded-cid bg-bg-secondary p-3 text-sm ${
              (offeneAusgaben?.anzahl ?? 0) === 0 ? "opacity-50" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={annahmen.offeneAusgaben}
              disabled={(offeneAusgaben?.anzahl ?? 0) === 0}
              onChange={(e) => onAnnahmen({ ...annahmen, offeneAusgaben: e.target.checked })}
            />
            <span>
              <b className="block text-text-primary">
                {t("assistent.probelauf.ausgaben_freigeben", {
                  anzahl: offeneAusgaben?.anzahl ?? 0,
                })}
              </b>
              <span className="text-xs text-text-tertiary">
                {t("assistent.probelauf.plus_ausgaben", {
                  betrag: euro(offeneAusgaben?.betrag ?? 0, sp),
                })}
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 rounded-cid bg-bg-secondary p-3 text-sm ${
              (offeneBeitraege?.anzahl ?? 0) === 0 ? "opacity-50" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={annahmen.offeneBeitraege}
              disabled={(offeneBeitraege?.anzahl ?? 0) === 0}
              onChange={(e) => onAnnahmen({ ...annahmen, offeneBeitraege: e.target.checked })}
            />
            <span>
              <b className="block text-text-primary">
                {t("assistent.probelauf.beitraege_annehmen", {
                  anzahl: offeneBeitraege?.anzahl ?? 0,
                })}
              </b>
              <span className="text-xs text-text-tertiary">
                {t("assistent.probelauf.plus_einnahmen", {
                  betrag: euro(offeneBeitraege?.betrag ?? 0, sp),
                })}
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("abschluss.einnahmen")}</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {euro(daten.einnahmen.total, sp)}
          </div>
          <Veraenderung jetzt={daten.einnahmen.total} vorher={daten.einnahmen.total_vorjahr} />
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("abschluss.ausgaben")}</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {euro(daten.ausgaben.total, sp)}
          </div>
          <Veraenderung
            jetzt={daten.ausgaben.total}
            vorher={daten.ausgaben.total_vorjahr}
            besserWennNiedriger
          />
        </div>
        <div
          className={`rounded-cid-lg border-2 bg-bg-primary p-3 shadow-sm ${
            Number(daten.ergebnis) >= 0 ? "border-status-successText" : "border-status-dangerText"
          }`}
        >
          <div className="text-[10px] uppercase text-text-tertiary">
            <Fachwort begriff="ergebnis" />
          </div>
          <div
            className={`text-xl font-bold tabular-nums ${
              Number(daten.ergebnis) >= 0 ? "text-status-successText" : "text-status-dangerText"
            }`}
          >
            {euroSigniert(daten.ergebnis, sp)}
          </div>
          <span className="text-xs text-text-secondary">
            {t("assistent.probelauf.vorjahr_ergebnis", {
              betrag: euroSigniert(daten.ergebnis_vorjahr, sp),
            })}
          </span>
        </div>
      </div>
      <HilfeHinweis>{t("assistent.probelauf.ergebnis_hilfe")}</HilfeHinweis>

      <div className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="text-sm font-bold text-text-primary">
          {t("assistent.probelauf.vergleich")}
        </h2>
        {balken(
          t("abschluss.einnahmen"),
          daten.einnahmen.total,
          daten.einnahmen.total_vorjahr,
          "bg-ca",
        )}
        {balken(
          t("abschluss.ausgaben"),
          daten.ausgaben.total,
          daten.ausgaben.total_vorjahr,
          "bg-status-warningText",
        )}
        <p className="text-[11px] text-text-tertiary">{t("assistent.probelauf.balken_legende")}</p>
      </div>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-text-primary">
          {t("assistent.probelauf.quellen")}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text-tertiary">
              <th className="pb-1 font-medium">{t("assistent.probelauf.quelle")}</th>
              <th className="pb-1 text-right font-medium">{daten.annee}</th>
              <th className="pb-1 text-right font-medium">{t("assistent.probelauf.vorjahr")}</th>
            </tr>
          </thead>
          <tbody>
            {daten.einnahmen.lignes.map((z) => (
              <tr key={z.cle} className="border-t border-text-tertiary/10">
                <td className="py-1.5">{t(`assistent.quellen.${z.cle}`)}</td>
                <td className="py-1.5 text-right tabular-nums">{euro(z.montant, sp)}</td>
                <td className="py-1.5 text-right tabular-nums text-text-secondary">
                  {euro(z.montant_precedent, sp)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-text-tertiary/20 font-bold">
              <td className="py-1.5">{t("assistent.probelauf.summe")}</td>
              <td className="py-1.5 text-right tabular-nums">{euro(daten.einnahmen.total, sp)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {euro(daten.einnahmen.total_vorjahr, sp)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
