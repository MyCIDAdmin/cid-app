/**
 * Onglet "Financier" — Statistiques & KPIs (mockup #pg-stats, FDD §5.3).
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useStatsFinancier } from "../../hooks/useStats";
import type { StatsFiltres } from "../../types/stats";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function OngletFinancier({ filtres }: { filtres: StatsFiltres }) {
  const { t } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsFinancier(filtres);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  const revenus = [
    { nom: t("financier.revenus_boutique"), montant: Number(data.revenus_boutique) },
    { nom: t("financier.revenus_adhesions"), montant: Number(data.revenus_adhesions) },
    { nom: t("financier.revenus_evenements"), montant: Number(data.revenus_evenements) },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-cid-lg bg-ca p-3 text-white shadow-sm">
          <div className="text-[10px] uppercase text-white/70">{t("financier.solde")}</div>
          <div className="text-lg font-bold">{formatMontant(data.solde)}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("financier.recettes")}</div>
          <div className="text-lg font-bold text-text-primary">{formatMontant(data.recettes)}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">{t("financier.depenses")}</div>
          <div className="text-lg font-bold text-text-primary">{formatMontant(data.depenses)}</div>
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">
            {t("financier.taux_collecte")}
          </div>
          <div className="text-lg font-bold text-text-primary">{data.taux_collecte} %</div>
        </div>
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
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("financier.top_contributeurs")}
          </h2>
          {data.top_contributeurs.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t("financier.aucun_contributeur")}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                  <th className="py-1">{t("financier.col_membre")}</th>
                  <th className="py-1 text-right">{t("financier.col_total")}</th>
                </tr>
              </thead>
              <tbody>
                {data.top_contributeurs.map((c) => (
                  <tr key={c.membre_id} className="border-b border-text-tertiary/10 last:border-0">
                    <td className="py-1">{c.nom}</td>
                    <td className="py-1 text-right font-bold text-ca">{formatMontant(c.total)}</td>
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
