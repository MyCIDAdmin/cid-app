/**
 * Onglet "Financier" — Statistiques & KPIs (mockup #pg-stats, FDD §5.3).
 *
 * Kacheln comptage/pourcentage animées via AnimatedKpiTile (demande utilisateur du 2026-09-25) ;
 * les montants (solde/recettes/dépenses/cotisations en attente) restent statiques, même
 * convention que KpiTile côté DashboardPage (voir sa docstring). Pas de <Legend/> ajoutée au
 * graphique "revenus_par_source" : une seule série, déjà identifiée par l'axe X et le titre — la
 * skill dataviz ne l'exige que pour ≥2 séries. Detail-box triable ajoutée sous chaque graphique
 * agrégé ("Detail-Box (sortierbare Tabelle) pro aggregiertem Graphen mit globalem Filter") : le
 * filtre global est déjà appliqué en amont via `filtres` (partagé par les 4 onglets, voir
 * StatsPage.tsx), la detail-box ne fait que trier les lignes déjà filtrées.
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useStatsFinancier } from "../../hooks/useStats";
import type { StatsFiltres, TopContributeur } from "../../types/stats";
import AnimatedKpiTile from "./AnimatedKpiTile";
import DetailBoxTriable, { type ColonneDetailBox } from "./DetailBoxTriable";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

interface RevenuSource {
  cle: string;
  nom: string;
  montant: number;
}

export default function OngletFinancier({ filtres }: { filtres: StatsFiltres }) {
  const { t } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsFinancier(filtres);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  const revenus: RevenuSource[] = [
    { cle: "boutique", nom: t("financier.revenus_boutique"), montant: Number(data.revenus_boutique) },
    {
      cle: "adhesions",
      nom: t("financier.revenus_adhesions"),
      montant: Number(data.revenus_adhesions),
    },
    {
      cle: "evenements",
      nom: t("financier.revenus_evenements"),
      montant: Number(data.revenus_evenements),
    },
  ];

  const colonnesRevenus: ColonneDetailBox<RevenuSource>[] = [
    { cle: "nom", label: t("financier.col_quelle") },
    {
      cle: "montant",
      label: t("financier.col_total"),
      align: "right",
      render: (r) => formatMontant(r.montant),
    },
  ];

  const colonnesContributeurs: ColonneDetailBox<TopContributeur>[] = [
    { cle: "nom", label: t("financier.col_membre") },
    {
      cle: "cotisations",
      label: t("financier.col_cotisations"),
      align: "right",
      render: (r) => formatMontant(r.cotisations),
      valeurTri: (r) => Number(r.cotisations),
    },
    {
      cle: "evenements",
      label: t("financier.col_evenements"),
      align: "right",
      render: (r) => formatMontant(r.evenements),
      valeurTri: (r) => Number(r.evenements),
    },
    {
      cle: "dons",
      label: t("financier.col_dons"),
      align: "right",
      render: (r) => formatMontant(r.dons),
      valeurTri: (r) => Number(r.dons),
    },
    {
      cle: "total",
      label: t("financier.col_total"),
      align: "right",
      render: (r) => formatMontant(r.total),
      valeurTri: (r) => Number(r.total),
    },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AnimatedKpiTile label={t("financier.solde")} value={formatMontant(data.solde)} accent />
        <AnimatedKpiTile label={t("financier.recettes")} value={formatMontant(data.recettes)} />
        <AnimatedKpiTile label={t("financier.depenses")} value={formatMontant(data.depenses)} />
        <AnimatedKpiTile
          label={t("financier.taux_collecte")}
          value={data.taux_collecte}
          suffix=" %"
        />
      </div>

      <div className="mb-4 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div className="text-[10px] uppercase text-text-tertiary">
          {t("financier.cotisations_en_attente")}
        </div>
        <div className="text-lg font-bold text-status-warningText">
          {formatMontant(data.cotisations_en_attente)}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("financier.revenus_par_source")}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenus}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
              <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: number) => formatMontant(value)} />
              <Bar dataKey="montant" fill="#CC0000" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3">
            <DetailBoxTriable
              colonnes={colonnesRevenus}
              lignes={revenus}
              getRowKey={(r) => r.cle}
              triInitial="montant"
              directionInitiale="desc"
              messageVide={t("financier.aucune_donnee")}
            />
          </div>
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("financier.top_contributeurs")}
          </h2>
          <DetailBoxTriable
            colonnes={colonnesContributeurs}
            lignes={data.top_contributeurs}
            getRowKey={(r) => r.membre_id}
            triInitial="total"
            directionInitiale="desc"
            messageVide={t("financier.aucun_contributeur")}
          />
        </div>
      </div>
    </div>
  );
}
