/**
 * Onglet "Membres" — Statistiques & KPIs (mockup #pg-stats, FDD §5.3). Répartition
 * professionnelle volontairement absente (voir apps.stats.services docstring — Membre ne porte
 * pas ce champ).
 *
 * Kacheln animées (AnimatedKpiTile) + detail-box triable sous chaque graphique agrégé, mêmes
 * conventions que OngletFinancier.tsx (voir sa docstring) — pas de <Legend/> (une seule série
 * par graphique, déjà identifiée par les axes/le titre).
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useStatsMembres } from "../../hooks/useStats";
import type { RepartitionVille, StatsFiltres, TrancheAge } from "../../types/stats";
import AnimatedKpiTile from "./AnimatedKpiTile";
import DetailBoxTriable, { type ColonneDetailBox } from "./DetailBoxTriable";

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

  /** Libellé de tranche d'âge dans la langue de l'utilisateur (le backend envoie les bornes). */
  const trancheLabel = (r: TrancheAge) =>
    r.age_min === undefined
      ? r.tranche
      : r.age_max == null
        ? t("membres.tranche_plus", { min: r.age_min })
        : t("membres.tranche_plage", { min: r.age_min, max: r.age_max });

  const colonnesVille: ColonneDetailBox<RepartitionVille>[] = [
    { cle: "ville_de", label: t("membres.col_ville") },
    { cle: "nombre", label: t("membres.col_nombre"), align: "right" },
  ];

  const colonnesAges: ColonneDetailBox<TrancheAge>[] = [
    { cle: "tranche", label: t("membres.col_tranche"), render: (r) => trancheLabel(r) },
    { cle: "nombre", label: t("membres.col_nombre"), align: "right" },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <AnimatedKpiTile label={t("membres.total")} value={data.total} accent />
        <AnimatedKpiTile label={t("membres.actifs")} value={data.actifs} />
        <AnimatedKpiTile label={t("membres.inactifs")} value={data.inactifs} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("membres.par_ville")}</h2>
          {data.par_ville.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("membres.aucune_donnee")}</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.par_ville} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="ville_de" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip />
                  <Bar dataKey="nombre" fill="#CC0000" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3">
                <DetailBoxTriable
                  colonnes={colonnesVille}
                  lignes={data.par_ville}
                  getRowKey={(r) => r.ville_de}
                  triInitial="nombre"
                  directionInitiale="desc"
                  messageVide={t("membres.aucune_donnee")}
                />
              </div>
            </>
          )}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("membres.pyramide_ages")}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.pyramide_ages.map((r) => ({ ...r, tranche: trancheLabel(r) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="nombre" fill="#8B0000" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3">
            <DetailBoxTriable
              colonnes={colonnesAges}
              lignes={data.pyramide_ages}
              getRowKey={(r) => r.tranche}
              triInitial="nombre"
              directionInitiale="desc"
              messageVide={t("membres.aucune_donnee")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
