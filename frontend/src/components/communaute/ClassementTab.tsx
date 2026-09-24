/**
 * Onglet "Tabelle"/"Classement" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule : le classement est toujours synchronisé automatiquement depuis GOAL API
 * (voir backend apps.communaute.services), jamais éditable ici.
 *
 * Bascule "Gesamt/Heim/Auswärts" (ensemble/domicile/extérieur) ajoutée lors du passage à
 * GOAL API (2026-09-24) : le classement contient désormais nativement une répartition
 * domicile/extérieur par équipe (`ClassementLigue.*_domicile`/`*_exterieur`, voir
 * apps.communaute.services), indisponible sous SerpApi/Google Sports. Le rang affiché
 * reste toujours le rang général du championnat (GOAL API ne fournit pas de classement
 * domicile/extérieur reclassé) — seules les colonnes statistiques changent selon la vue.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useClassementLigue } from "../../hooks/useCommunaute";
import type { ClassementLigue } from "../../types/communaute";

type Vue = "ensemble" | "domicile" | "exterieur";

const VUES: Vue[] = ["ensemble", "domicile", "exterieur"];

function statistiquesDeLaVue(ligne: ClassementLigue, vue: Vue) {
  if (vue === "domicile") {
    return {
      joues: ligne.joues_domicile,
      victoires: ligne.victoires_domicile,
      nuls: ligne.nuls_domicile,
      defaites: ligne.defaites_domicile,
      buts_pour: ligne.buts_pour_domicile,
      buts_contre: ligne.buts_contre_domicile,
      points: ligne.points_domicile,
    };
  }
  if (vue === "exterieur") {
    return {
      joues: ligne.joues_exterieur,
      victoires: ligne.victoires_exterieur,
      nuls: ligne.nuls_exterieur,
      defaites: ligne.defaites_exterieur,
      buts_pour: ligne.buts_pour_exterieur,
      buts_contre: ligne.buts_contre_exterieur,
      points: ligne.points_exterieur,
    };
  }
  return {
    joues: ligne.joues,
    victoires: ligne.victoires,
    nuls: ligne.nuls,
    defaites: ligne.defaites,
    buts_pour: ligne.buts_pour,
    buts_contre: ligne.buts_contre,
    points: ligne.points,
  };
}

export default function ClassementTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useClassementLigue();
  const [vue, setVue] = useState<Vue>("ensemble");
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-text-tertiary/10 px-3 py-2">
        <span className="text-xs font-bold text-text-tertiary">
          {t("live.classement_saison", { saison: lignes[0].saison })}
        </span>
        <div className="flex gap-1" role="tablist" aria-label={t("live.classement_vue_label")}>
          {VUES.map((valeur) => (
            <button
              key={valeur}
              type="button"
              role="tab"
              aria-selected={vue === valeur}
              onClick={() => setVue(valeur)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                vue === valeur
                  ? "bg-ca text-white"
                  : "bg-bg-secondary text-text-tertiary hover:text-text-primary"
              }`}
            >
              {t(`live.classement_vue_${valeur}`)}
            </button>
          ))}
        </div>
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
            {vue === "ensemble" && <th className="px-3 py-2">{t("live.classement_forme")}</th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => {
            const stats = statistiquesDeLaVue(ligne, vue);
            const difference = stats.buts_pour - stats.buts_contre;
            return (
              <tr
                key={ligne.id}
                className={`border-t border-text-tertiary/10 ${
                  ligne.equipe === "Club Africain"
                    ? "bg-cal/40 font-bold text-cad"
                    : "text-text-primary"
                }`}
              >
                <td className="px-3 py-2">{ligne.rang}</td>
                <td className="px-3 py-2">
                  {ligne.equipe}
                  {ligne.zone_texte && (
                    <span className="ml-1.5 text-[10px] font-normal text-text-tertiary">
                      {ligne.zone_texte}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{stats.joues}</td>
                <td className="px-2 py-2 text-center tabular-nums">{stats.victoires}</td>
                <td className="px-2 py-2 text-center tabular-nums">{stats.nuls}</td>
                <td className="px-2 py-2 text-center tabular-nums">{stats.defaites}</td>
                <td className="px-2 py-2 text-center tabular-nums">{stats.buts_pour}</td>
                <td className="px-2 py-2 text-center tabular-nums">{stats.buts_contre}</td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {difference > 0 ? `+${difference}` : difference}
                </td>
                <td className="px-2 py-2 text-center text-sm font-bold tabular-nums">
                  {stats.points}
                </td>
                {vue === "ensemble" && (
                  <td className="px-3 py-2 text-xs tracking-wide text-text-tertiary">
                    {ligne.forme_recente}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
