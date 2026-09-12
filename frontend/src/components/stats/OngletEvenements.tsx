/**
 * Onglet "Événements" — Statistiques & KPIs (mockup #pg-stats, FDD §5.3).
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useStatsEvenements } from "../../hooks/useStats";
import type { StatsFiltres } from "../../types/stats";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function OngletEvenements({ filtres }: { filtres: StatsFiltres }) {
  const { t } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsEvenements(filtres);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-cid-lg bg-ca p-3 text-white shadow-sm">
          <div className="text-[10px] uppercase text-white/70">{t("evenements.nombre")}</div>
          <div className="text-lg font-bold">{data.nombre_evenements}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">
            {t("evenements.taux_remplissage")}
          </div>
          <div className="text-lg font-bold text-text-primary">{data.taux_remplissage_moyen} %</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">
            {t("evenements.inscriptions")}
          </div>
          <div className="text-lg font-bold text-text-primary">{data.inscriptions_totales}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("evenements.revenus")}</div>
          <div className="text-lg font-bold text-text-primary">{formatMontant(data.revenus)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("evenements.par_type")}</h2>
          {data.par_type.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("evenements.aucune_donnee")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.par_type}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
                <XAxis dataKey="type_evenement" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="nombre" fill="#CC0000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("evenements.participation")}
          </h2>
          {data.participation_par_evenement.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("evenements.aucune_donnee")}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                  <th className="py-1">{t("evenements.col_titre")}</th>
                  <th className="py-1 text-right">{t("evenements.col_places")}</th>
                </tr>
              </thead>
              <tbody>
                {data.participation_par_evenement.map((ev) => (
                  <tr key={ev.id} className="border-b border-text-tertiary/10 last:border-0">
                    <td className="py-1">{ev.titre}</td>
                    <td className="py-1 text-right">
                      {ev.places_reservees}
                      {ev.places_max ? ` / ${ev.places_max}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
