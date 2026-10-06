import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exporterBilanExcel, exporterBilanPdf, exporterBuchungenCsv } from "../../api/stats";
import { usePruefung } from "../../hooks/useFinances";
import type { Depense } from "../../types/finances";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function Liste({ titre, zeilen, leer }: { titre: string; zeilen: Depense[]; leer: string }) {
  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-2 text-xs font-bold text-text-primary">
        {titre} ({zeilen.length})
      </h2>
      {zeilen.length === 0 ? (
        <p className="text-xs text-text-tertiary">{leer}</p>
      ) : (
        <ul className="divide-y divide-text-tertiary/10 text-sm">
          {zeilen.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                {d.date_depense} · {d.fournisseur} · {d.categorie_nom}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-medium">{formatMontant(d.montant)}</span>
                {d.justificatif_url && (
                  <a
                    href={d.justificatif_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-ca hover:underline"
                  >
                    Beleg
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kassenprüfer-Ansicht : lesend, mit Auffälligkeiten und Exporten (Berechtigung `page_finances`
 * auf „Lesen“ genügt). */
export default function PruefungTab() {
  const { t } = useTranslation("finances");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const { data, isLoading, isError } = usePruefung(annee);
  const [fehler, setFehler] = useState<string | null>(null);

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
    <div>
      <p className="mb-3 text-xs text-text-tertiary">{t("pruefung.intro")}</p>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label htmlFor="pr-annee" className="mb-1 block text-[10px] uppercase text-text-tertiary">
            {t("annee")}
          </label>
          <input
            id="pr-annee"
            type="number"
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div className="ml-auto flex gap-2">
          {(["csv", "excel", "pdf"] as const).map((a) => (
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
      </div>
      {fehler && <p className="mb-2 text-xs text-status-dangerText">{fehler}</p>}

      {isLoading ? (
        <p className="text-sm text-text-tertiary">{t("chargement")}</p>
      ) : isError || !data ? (
        <p className="text-sm text-status-dangerText">{t("erreur")}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              [t("pruefung.freigegeben"), String(data.anzahl_freigegeben)],
              [t("pruefung.summe"), formatMontant(data.summe_freigegeben)],
              [t("pruefung.offen"), String(data.anzahl_offen)],
              [t("pruefung.abgelehnt"), String(data.anzahl_abgelehnt)],
              [
                "Status",
                data.abschluss.abgeschlossen
                  ? t("pruefung.abgeschlossen")
                  : t("pruefung.offen_jahr"),
              ],
            ].map(([label, wert]) => (
              <div key={label} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
                <div className="text-[10px] uppercase text-text-tertiary">{label}</div>
                <div className="text-lg font-bold text-text-primary">{wert}</div>
              </div>
            ))}
          </div>
          <Liste
            titre={t("pruefung.ohne_beleg")}
            zeilen={data.ohne_beleg}
            leer={t("pruefung.keine")}
          />
          <Liste
            titre={t("pruefung.grosse", { betrag: data.schwelle })}
            zeilen={data.grosse_ausgaben}
            leer={t("pruefung.keine")}
          />
        </div>
      )}
    </div>
  );
}
