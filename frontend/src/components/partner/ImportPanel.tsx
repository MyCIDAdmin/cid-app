/** Einmaliger Import: Lieferantennamen aus den Ausgaben werden zu Partnern, die Ausgaben mit
 * ihnen verknüpft. Zuerst Vorschau (nichts wird geschrieben), dann Bestätigung. */
import { useTranslation } from "react-i18next";

import { useImportAusgaben } from "../../hooks/usePartner";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function ImportPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation("partner");
  const importieren = useImportAusgaben();
  const ergebnis = importieren.data;
  const betrag = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR" });

  return (
    <section className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-semibold">{t("import_titel")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-text-tertiary hover:underline"
        >
          {t("schliessen")}
        </button>
      </div>
      <p className="mb-3 text-sm text-text-secondary">{t("import_hinweis")}</p>

      {!ergebnis && (
        <button
          type="button"
          disabled={importieren.isPending}
          onClick={() => importieren.mutate(false)}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t("import_vorschau")}
        </button>
      )}

      {ergebnis && !ergebnis.bestaetigt && ergebnis.gruppen.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("import_nichts")}</p>
      )}
      {ergebnis && ergebnis.gruppen.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-cid border border-text-tertiary/20">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-tertiary text-left text-xs uppercase text-text-tertiary">
                  <th className="px-3 py-2">{t("feld_nom")}</th>
                  <th className="px-3 py-2 text-right">{t("import_ausgaben")}</th>
                  <th className="px-3 py-2 text-right">{t("import_summe")}</th>
                  <th className="px-3 py-2">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {ergebnis.gruppen.map((g) => (
                  <tr key={g.name} className="border-t border-text-tertiary/10">
                    <td className="px-3 py-2">{g.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.anzahl}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{betrag.format(g.summe)}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary">
                      {g.neu ? t("import_neu") : t("import_vorhanden")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ergebnis.bestaetigt && (
            <button
              type="button"
              disabled={importieren.isPending}
              onClick={() => importieren.mutate(true)}
              className="mt-3 rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {t("import_bestaetigen", {
                neu: ergebnis.gruppen.filter((g) => g.neu).length,
                gesamt: ergebnis.gruppen.length,
              })}
            </button>
          )}
        </>
      )}
      {ergebnis?.bestaetigt && (
        <p role="status" className="mt-3 text-sm text-text-primary">
          {t("import_fertig", {
            neu: ergebnis.partner_neu ?? 0,
            ausgaben: ergebnis.ausgaben_verknuepft ?? 0,
          })}
        </p>
      )}
      {importieren.isError && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(importieren.error, t("fehler_aktion"))}
        </p>
      )}
    </section>
  );
}
