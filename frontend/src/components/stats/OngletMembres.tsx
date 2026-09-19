/**
 * Onglet "Membres" — Statistiques & KPIs (mockup #pg-stats, FDD §5.3). Répartition
 * professionnelle volontairement absente (voir apps.stats.services docstring — Membre ne porte
 * pas ce champ).
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useStatsMembres } from "../../hooks/useStats";
import type { StatsFiltres } from "../../types/stats";

export default function OngletMembres({ filtres }: { filtres: StatsFiltres }) {
  const { t } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsMembres({
    ville: filtres.ville,
    statut: filtres.statut,
    land: filtres.land,
    pays: filtres.pays,
    date_adhesion_apres: filtres.date_adhesion_apres,
    date_adhesion_avant: filtres.date_adhesion_avant,
  });

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-cid-lg bg-ca p-3 text-white shadow-sm">
          <div className="text-[10px] uppercase text-white/70">{t("membres.total")}</div>
          <div className="text-lg font-bold">{data.total}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("membres.actifs")}</div>
          <div className="text-lg font-bold text-status-successText">{data.actifs}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("membres.inactifs")}</div>
          <div className="text-lg font-bold text-text-primary">{data.inactifs}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("membres.par_ville")}</h2>
          {data.par_ville.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("membres.aucune_donnee")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.par_ville} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="ville_de" tick={{ fontSize: 10 }} width={70} />
                <Tooltip />
                <Bar dataKey="nombre" fill="#CC0000" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("membres.pyramide_ages")}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.pyramide_ages}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="nombre" fill="#8B0000" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
