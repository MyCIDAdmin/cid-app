/**
 * Onglet "Événements" — Statistiques & KPIs (mockup #pg-stats, FDD §5.3).
 *
 * Kacheln animées (AnimatedKpiTile) + detail-box triable sous chaque graphique agrégé, mêmes
 * conventions que OngletFinancier.tsx (voir sa docstring). "revenus" reste un montant statique
 * (même convention que KpiTile/Dashboard) ; "nombre_evenements"/"taux_remplissage_moyen"/
 * "inscriptions_totales" sont des compteurs, animés.
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useStatsEvenements } from "../../hooks/useStats";
import type { ParticipationEvenement, RepartitionType, StatsFiltres } from "../../types/stats";
import AnimatedKpiTile from "./AnimatedKpiTile";
import DetailBoxTriable, { type ColonneDetailBox } from "./DetailBoxTriable";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function OngletEvenements({ filtres }: { filtres: StatsFiltres }) {
  const { t } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsEvenements(filtres);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  const colonnesType: ColonneDetailBox<RepartitionType>[] = [
    { cle: "type_evenement", label: t("evenements.col_type") },
    { cle: "nombre", label: t("evenements.col_nombre"), align: "right" },
  ];

  const colonnesParticipation: ColonneDetailBox<ParticipationEvenement>[] = [
    { cle: "titre", label: t("evenements.col_titre") },
    {
      cle: "places_reservees",
      label: t("evenements.col_places"),
      align: "right",
      render: (r) => `${r.places_reservees}${r.places_max ? ` / ${r.places_max}` : ""}`,
    },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AnimatedKpiTile
          label={t("evenements.nombre")}
          value={data.nombre_evenements}
          accent
        />
        <AnimatedKpiTile
          label={t("evenements.taux_remplissage")}
          value={data.taux_remplissage_moyen}
          suffix=" %"
        />
        <AnimatedKpiTile label={t("evenements.inscriptions")} value={data.inscriptions_totales} />
        <AnimatedKpiTile label={t("evenements.revenus")} value={formatMontant(data.revenus)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("evenements.par_type")}</h2>
          {data.par_type.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("evenements.aucune_donnee")}</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.par_type}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
                  <XAxis dataKey="type_evenement" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="nombre" fill="#CC0000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3">
                <DetailBoxTriable
                  colonnes={colonnesType}
                  lignes={data.par_type}
                  getRowKey={(r) => r.type_evenement}
                  triInitial="nombre"
                  directionInitiale="desc"
                  messageVide={t("evenements.aucune_donnee")}
                />
              </div>
            </>
          )}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("evenements.participation")}
          </h2>
          <DetailBoxTriable
            colonnes={colonnesParticipation}
            lignes={data.participation_par_evenement}
            getRowKey={(r) => r.id}
            triInitial="places_reservees"
            directionInitiale="desc"
            messageVide={t("evenements.aucune_donnee")}
          />
        </div>
      </div>
    </div>
  );
}
