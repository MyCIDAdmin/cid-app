import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProtokoll } from "../../hooks/useFinances";
import type { AktionProtokoll } from "../../types/finances";

const AKTIONEN: AktionProtokoll[] = [
  "erstellt",
  "geaendert",
  "geloescht",
  "freigegeben",
  "abgelehnt",
  "budget",
  "abgeschlossen",
  "wiedergeoeffnet",
];

function formatAenderung(feld: string, wert: unknown): string {
  if (Array.isArray(wert) && wert.length === 2) {
    return `${feld}: ${String(wert[0])} → ${String(wert[1])}`;
  }
  return `${feld}: ${String(wert)}`;
}

export default function ProtokollTab() {
  const { t, i18n } = useTranslation("finances");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [aktion, setAktion] = useState<AktionProtokoll | "">("");
  const { data, isLoading, isError } = useProtokoll({ annee, aktion: aktion || undefined });

  return (
    <div>
      <p className="mb-3 text-xs text-text-tertiary">{t("protokoll.intro")}</p>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="prot-annee"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("annee")}
          </label>
          <input
            id="prot-annee"
            type="number"
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="prot-aktion"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("protokoll.aktion")}
          </label>
          <select
            id="prot-aktion"
            value={aktion}
            onChange={(e) => setAktion(e.target.value as AktionProtokoll | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("protokoll.alle")}</option>
            {AKTIONEN.map((a) => (
              <option key={a} value={a}>
                {t(`protokoll.aktionen.${a}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        {isLoading ? (
          <p className="text-sm text-text-tertiary">{t("chargement")}</p>
        ) : isError || !data ? (
          <p className="text-sm text-status-dangerText">{t("erreur")}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("protokoll.leer")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text-tertiary">
                <th className="px-2 py-1.5">{t("protokoll.zeit")}</th>
                <th className="px-2 py-1.5">{t("protokoll.benutzer")}</th>
                <th className="px-2 py-1.5">{t("protokoll.aktion")}</th>
                <th className="px-2 py-1.5">{t("protokoll.text")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-t border-text-tertiary/10 align-top">
                  <td className="whitespace-nowrap px-2 py-2 text-xs">
                    {new Date(e.zeitpunkt).toLocaleString(i18n.language)}
                  </td>
                  <td className="px-2 py-2">{e.benutzer_name}</td>
                  <td className="px-2 py-2">{t(`protokoll.aktionen.${e.aktion}`)}</td>
                  <td className="px-2 py-2">
                    {e.zusammenfassung}
                    {Object.keys(e.aenderungen).length > 0 && (
                      <ul className="mt-1 text-[11px] text-text-tertiary">
                        {Object.entries(e.aenderungen).map(([feld, wert]) => (
                          <li key={feld}>{formatAenderung(feld, wert)}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
