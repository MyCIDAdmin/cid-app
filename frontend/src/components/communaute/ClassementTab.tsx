/**
 * Onglet "Tabelle"/"Classement" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule : le classement est toujours synchronisé automatiquement depuis SerpApi/Google Sports
 * (voir backend apps.communaute.services), jamais éditable ici.
 */
import { useTranslation } from "react-i18next";

import { useClassementLigue } from "../../hooks/useCommunaute";

export default function ClassementTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useClassementLigue();
  const lignes = data?.results ?? [];

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.classement_chargement")}</p>;
  }
  if (isError) {
    return <p className="text-sm text-status-dangerText">{t("live.classement_erreur")}</p>;
  }
  if (lignes.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("live.classement_vide")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
      <div className="border-b border-text-tertiary/10 px-3 py-2 text-xs font-bold text-text-tertiary">
        {t("live.classement_saison", { saison: lignes[0].saison })}
      </div>
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase text-text-tertiary">
            <th className="px-3 py-2">{t("live.classement_rang")}</th>
            <th className="px-3 py-2">{t("live.classement_equipe")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_joues")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_victoires")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_nuls")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_defaites")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_buts_pour")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_buts_contre")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_difference")}</th>
            <th className="px-2 py-2 text-center">{t("live.classement_points")}</th>
            <th className="px-3 py-2">{t("live.classement_forme")}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr
              key={ligne.id}
              className={`border-t border-text-tertiary/10 ${
                ligne.equipe === "Club Africain"
                  ? "bg-cal/40 font-bold text-cad"
                  : "text-text-primary"
              }`}
            >
              <td className="px-3 py-2">{ligne.rang}</td>
              <td className="px-3 py-2">{ligne.equipe}</td>
              <td className="px-2 py-2 text-center tabular-nums">{ligne.joues}</td>
              <td className="px-2 py-2 text-center tabular-nums">{ligne.victoires}</td>
              <td className="px-2 py-2 text-center tabular-nums">{ligne.nuls}</td>
              <td className="px-2 py-2 text-center tabular-nums">{ligne.defaites}</td>
              <td className="px-2 py-2 text-center tabular-nums">{ligne.buts_pour}</td>
              <td className="px-2 py-2 text-center tabular-nums">{ligne.buts_contre}</td>
              <td className="px-2 py-2 text-center tabular-nums">
                {ligne.difference > 0 ? `+${ligne.difference}` : ligne.difference}
              </td>
              <td className="px-2 py-2 text-center text-sm font-bold tabular-nums">
                {ligne.points}
              </td>
              <td className="px-3 py-2 text-xs tracking-wide text-text-tertiary">
                {ligne.forme_recente}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
