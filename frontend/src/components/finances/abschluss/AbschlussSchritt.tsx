import { useTranslation } from "react-i18next";

import type { Probelauf } from "../../../types/finances";
import { euro, euroSigniert } from "../../../utils/finanzen";
import { Fachwort, HilfeHinweis } from "../Erklaerung";

/** Schritt 4: Folgen verstehen, Jahr zur Bestätigung eintippen, abschließen. */
export default function AbschlussSchritt({
  daten,
  annee,
  modifiable,
  eingabe,
  onEingabe,
  onAbschliessen,
  laeuft,
  begruendungen,
}: {
  /** Probelauf OHNE „Was wäre wenn?“: so wird tatsächlich abgeschlossen. */
  daten: Probelauf;
  annee: number;
  modifiable: boolean;
  eingabe: string;
  onEingabe: (v: string) => void;
  onAbschliessen: () => void;
  laeuft: boolean;
  begruendungen: number;
}) {
  const { t, i18n } = useTranslation("finances");
  const sp = i18n.language;
  const pflichtOffen = daten.pruefliste.filter((p) => p.stufe === "pflicht" && !p.ok).length;
  const freigeschaltet = modifiable && pflichtOffen === 0 && eingabe.trim() === String(annee);

  return (
    <section aria-label={t("assistent.schritte.abschliessen")} className="space-y-3">
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-text-primary">
          {t("assistent.abschluss.folgen_titel")}
        </h2>
        <ul className="space-y-1.5 text-sm text-text-primary">
          <li>🔒 {t("assistent.abschluss.folge_sperre", { annee })}</li>
          <li>
            📄{" "}
            {t("assistent.abschluss.folge_zahlen", {
              einnahmen: euro(daten.einnahmen.total, sp),
              ausgaben: euro(daten.ausgaben.total, sp),
              ergebnis: euroSigniert(daten.ergebnis, sp),
            })}
          </li>
          {begruendungen > 0 && (
            <li>📝 {t("assistent.abschluss.folge_begruendungen", { n: begruendungen })}</li>
          )}
          <li>📒 {t("assistent.abschluss.folge_protokoll")}</li>
          <li>🛡️ {t("assistent.abschluss.folge_wiedereroeffnen")}</li>
        </ul>
        <HilfeHinweis>
          {t("assistent.abschluss.hilfe_a")} <Fachwort begriff="abschluss" />
          {t("assistent.abschluss.hilfe_b")}
        </HilfeHinweis>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        {pflichtOffen > 0 && (
          <p
            role="alert"
            className="mb-3 rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText"
          >
            {t("assistent.abschluss.pflicht_offen", { n: pflichtOffen })}
          </p>
        )}
        {!modifiable && (
          <p className="mb-3 text-xs text-text-tertiary">{t("assistent.abschluss.nur_lesen")}</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="abs-bestaetigung" className="mb-1 block text-xs text-text-secondary">
              {t("assistent.abschluss.bestaetigung_label")}
            </label>
            <input
              id="abs-bestaetigung"
              inputMode="numeric"
              autoComplete="off"
              placeholder={String(annee)}
              value={eingabe}
              onChange={(e) => onEingabe(e.target.value)}
              disabled={!modifiable || pflichtOffen > 0}
              className="w-28 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!freigeschaltet || laeuft}
            onClick={onAbschliessen}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("assistent.abschluss.knopf", { annee })}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-tertiary">
          {t("assistent.abschluss.echte_zahlen")}
        </p>
      </div>
    </section>
  );
}
