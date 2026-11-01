import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exporterBilanExcel, exporterBilanPdf, exporterBuchungenCsv } from "../../../api/stats";
import type { Abschluss } from "../../../types/finances";
import { extractApiErrorMessage } from "../../../utils/apiError";
import { euro, euroSigniert } from "../../../utils/finanzen";
import { declencherTelechargement } from "../../../utils/telechargement";
import { Fachwort, HilfeHinweis } from "../Erklaerung";

/** Ansicht eines abgeschlossenen Jahres: festgehaltene Zahlen, Berichte, Wiedereröffnen. */
export default function AbgeschlossenAnsicht({
  data,
  annee,
  namen,
  istAppAdmin,
  onWiedereroeffnen,
  laeuft,
}: {
  data: Abschluss;
  annee: number;
  /** Kostenart-ID → lokalisierter Name, für die gespeicherten Begründungen. */
  namen: Record<string, string>;
  istAppAdmin: boolean;
  onWiedereroeffnen: (grund: string) => void;
  laeuft: boolean;
}) {
  const { t, i18n } = useTranslation("finances");
  const sp = i18n.language;
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const datum = data.abgeschlossen_am ? new Date(data.abgeschlossen_am).toLocaleDateString(sp) : "";
  const begruendungen = Object.entries(data.snapshot?.begruendungen ?? {});

  async function exportieren(art: "csv" | "excel" | "pdf") {
    setFehler(null);
    try {
      if (art === "csv")
        declencherTelechargement(await exporterBuchungenCsv(annee), `buchungen_${annee}.csv`);
      else if (art === "pdf")
        declencherTelechargement(await exporterBilanPdf(annee), `jahresbilanz_${annee}.pdf`);
      else {
        const { blob, nomFichier } = await exporterBilanExcel(annee);
        declencherTelechargement(blob, nomFichier);
      }
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("erreur")));
    }
  }

  return (
    <div className="space-y-3">
      <p className="rounded-cid bg-status-successBg px-3 py-2 text-sm font-medium text-status-successText">
        🔒 {t("abschluss.status_zu", { datum, wer: data.abgeschlossen_durch })}
      </p>
      {data.snapshot && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(["recettes", "depenses", "resultat"] as const).map((k, i) => (
            <div key={k} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
              <div className="text-[10px] uppercase text-text-tertiary">
                {i === 2 ? (
                  <Fachwort begriff="ergebnis" />
                ) : (
                  t(i === 0 ? "abschluss.einnahmen" : "abschluss.ausgaben")
                )}
              </div>
              <div className="text-xl font-bold tabular-nums text-text-primary">
                {k === "resultat"
                  ? euroSigniert(data.snapshot![k], sp)
                  : euro(data.snapshot![k], sp)}
              </div>
            </div>
          ))}
        </div>
      )}
      {begruendungen.length > 0 && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-primary">
            {t("assistent.abgeschlossen.begruendungen")}
          </h2>
          <ul className="space-y-1 text-sm">
            {begruendungen.map(([id, text]) => (
              <li key={id}>
                <b>{namen[id] ?? id}:</b> {text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-text-primary">
          {t("assistent.abgeschlossen.berichte")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(["pdf", "excel", "csv"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => exportieren(a)}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
            >
              {t(`pruefung.export_${a}`)}
            </button>
          ))}
        </div>
        {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
        <HilfeHinweis>
          {t("assistent.abgeschlossen.hilfe_a")} <Fachwort begriff="pruefung" />{" "}
          {t("assistent.abgeschlossen.hilfe_b")} <Fachwort begriff="entlastung" />.
        </HilfeHinweis>
      </div>
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        {istAppAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label={t("abschluss.grund")}
              placeholder={t("abschluss.grund")}
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              className="w-72 max-w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={!grund.trim() || laeuft}
              onClick={() => onWiedereroeffnen(grund.trim())}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
            >
              {t("abschluss.wiedereroeffnen")}
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">{t("abschluss.nur_admin")}</p>
        )}
      </div>
    </div>
  );
}
