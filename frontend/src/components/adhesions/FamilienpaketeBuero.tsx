/** Büro-Übersicht der Familienpakete (R34): Hauptperson, gebuchte Plätze, eingetragene Kinder. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useFamilienpakete } from "../../hooks/useAdhesions";
import type { CampagneAdhesion } from "../../types/adhesion";
import { formatEuro } from "./familienpreis";

export default function FamilienpaketeBuero({ campagnen }: { campagnen: CampagneAdhesion[] }) {
  const { t } = useTranslation("adhesions");
  const [campagneId, setCampagneId] = useState(campagnen[0]?.id ?? "");
  const query = useFamilienpakete(campagneId || undefined);
  const daten = query.data;

  return (
    <section className="mt-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-xs font-bold text-text-primary">{t("familie_buero.titel")}</h2>
        <select
          aria-label={t("familie_buero.kampagne")}
          value={campagneId}
          onChange={(e) => setCampagneId(e.target.value)}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
        >
          {campagnen.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      {query.isLoading && (
        <p className="mt-2 text-sm text-text-tertiary">{t("admin.chargement")}</p>
      )}
      {query.isError && (
        <p className="mt-2 text-sm text-status-dangerText">{t("familie_buero.fehler")}</p>
      )}
      {daten && (
        <>
          <p className="mt-2 text-sm text-text-secondary">
            {t("familie_buero.zusammenfassung", {
              pakete: daten.zusammenfassung.pakete_bezahlt,
              erwachsene: daten.zusammenfassung.plaetze_erwachsene,
              kinder: daten.zusammenfassung.kinder_eingetragen,
            })}
          </p>
          {daten.pakete.length === 0 ? (
            <p className="mt-2 text-sm text-text-tertiary">{t("familie_buero.leer")}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                    <th className="py-1">{t("familie_buero.hauptperson")}</th>
                    <th className="py-1">{t("historique.col_offre")}</th>
                    <th className="py-1">{t("historique.col_statut")}</th>
                    <th className="py-1">{t("historique.col_prix")}</th>
                    <th className="py-1">{t("familie_buero.erwachsene")}</th>
                    <th className="py-1">{t("familie_buero.kinder")}</th>
                  </tr>
                </thead>
                <tbody>
                  {daten.pakete.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-text-tertiary/10 align-top last:border-0"
                    >
                      <td className="py-1">
                        {p.hauptperson}
                        <div className="text-text-tertiary">{p.numero_membre}</div>
                      </td>
                      <td className="py-1">{p.angebot}</td>
                      <td className="py-1">{t(`statut.${p.statut}`)}</td>
                      <td className="py-1">{formatEuro(p.prix_paye)}</td>
                      <td className="py-1">{p.plaetze_erwachsene}</td>
                      <td className="py-1">
                        {p.kinder.length}/{p.plaetze_kinder}
                        {p.kinder.map((k) => (
                          <div key={k.id} className="text-text-tertiary">
                            {k.name} ({t("familie.alter", { alter: k.alter })})
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
