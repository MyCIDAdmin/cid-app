/** Bericht über die Familienpakete je Kampagne (R36) : nur Zahlen, kein Personenbezug. Bleibt nach
 * der Anonymisierung vollständig und lässt sich als CSV für Excel herunterladen. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { downloadFamilienberichtCsv } from "../../api/adhesions";
import { useFamilienbericht } from "../../hooks/useAdhesions";
import { extractApiErrorMessage } from "../../utils/apiError";
import { formatEuro } from "./familienpreis";

const GRUPPEN = ["0-5", "6-11", "12-17", "18+"] as const;

export default function FamilienBericht() {
  const { t } = useTranslation("adhesions");
  const query = useFamilienbericht();
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function exportieren() {
    setFehler(null);
    setLaedt(true);
    try {
      const blob = await downloadFamilienberichtCsv();
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "familienpakete-bericht.csv";
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("familie_bericht.fehler")));
    } finally {
      setLaedt(false);
    }
  }

  const zeilen = query.data ?? [];
  return (
    <div className="mt-5 border-t border-text-tertiary/10 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex-1 text-xs font-bold text-text-primary">{t("familie_bericht.titel")}</h3>
        <button
          type="button"
          onClick={exportieren}
          disabled={laedt || zeilen.length === 0}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs hover:bg-bg-tertiary disabled:opacity-40"
        >
          {t("familie_bericht.export")}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">{t("familie_bericht.hinweis")}</p>
      {query.isLoading && (
        <p className="mt-2 text-sm text-text-tertiary">{t("admin.chargement")}</p>
      )}
      {query.isError && (
        <p className="mt-2 text-sm text-status-dangerText">{t("familie_bericht.fehler")}</p>
      )}
      {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
      {query.data && zeilen.length === 0 && (
        <p className="mt-2 text-sm text-text-tertiary">{t("familie_bericht.leer")}</p>
      )}
      {zeilen.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                <th className="py-1 pr-2">{t("familie_bericht.kampagne")}</th>
                <th className="py-1 pr-2">{t("familie_bericht.pakete")}</th>
                <th className="py-1 pr-2">{t("familie_bericht.erwachsene")}</th>
                <th className="py-1 pr-2">{t("familie_bericht.kinder")}</th>
                <th className="py-1 pr-2">{t("familie_bericht.preise")}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.campagne_id} className="border-b border-text-tertiary/10 align-top">
                  <td className="py-1 pr-2">
                    {z.campagne}
                    <div className="text-text-tertiary">{z.jahr}</div>
                  </td>
                  <td className="py-1 pr-2 tabular-nums">{z.pakete}</td>
                  <td className="py-1 pr-2">
                    {t("familie_bericht.erwachsene_zeile", {
                      angenommen: z.erwachsene_angenommen,
                      offen: z.erwachsene_offen,
                      abgelehnt: z.erwachsene_abgelehnt,
                      konflikt: z.erwachsene_konflikt,
                    })}
                  </td>
                  <td className="py-1 pr-2">
                    <span className="tabular-nums">{z.kinder}</span>
                    <div className="text-text-tertiary">
                      {GRUPPEN.map((g) => `${g}: ${z.altersgruppen[g]}`).join(" · ")}
                    </div>
                    {z.kinder_ueber_hoechstalter > 0 && (
                      <div className="text-status-warningText">
                        {t("familie_bericht.ueber_hoechstalter", {
                          anzahl: z.kinder_ueber_hoechstalter,
                        })}
                      </div>
                    )}
                  </td>
                  <td className="py-1 pr-2 tabular-nums">
                    {formatEuro(z.gezahlt)}
                    <div className="text-text-tertiary">
                      {t("familie_buero.liste_rabatt", {
                        liste: formatEuro(z.listenpreis),
                        pct: Number(z.rabatt_pct),
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
