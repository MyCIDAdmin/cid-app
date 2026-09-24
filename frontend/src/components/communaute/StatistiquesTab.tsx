/**
 * Onglet "Statistiken"/"Statistiques" — module Fan-Club (2026-09-24, extension du Live
 * Match). Dérivé de `ClassementLigue` (même source synchronisée TheSportsDB que l'onglet
 * Tabelle) — pas d'endpoint dédié, une ligne de classement porte déjà toutes les stats
 * d'équipe utiles (buts, forme récente).
 */
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useClassementLigue } from "../../hooks/useCommunaute";

const COULEUR_FORME: Record<string, string> = {
  V: "bg-status-successBg text-status-successText",
  N: "bg-bg-secondary text-text-tertiary",
  D: "bg-status-dangerBg text-status-dangerText",
};

export default function StatistiquesTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useClassementLigue();
  const clubAfricain = data?.results.find((ligne) => ligne.equipe === "Club Africain");

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_chargement")}</p>;
  }
  if (isError || !clubAfricain) {
    return <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>;
  }

  const donneesButs = [
    { nom: t("live.classement_buts_pour"), valeur: clubAfricain.buts_pour },
    { nom: t("live.classement_buts_contre"), valeur: clubAfricain.buts_contre },
  ];
  const forme = clubAfricain.forme_recente.split("").filter(Boolean);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_forme_titre")}
        </h2>
        {forme.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.statistiques_vide")}</p>
        ) : (
          <div className="flex gap-1.5">
            {forme.map((lettre, index) => (
              <span
                key={`${lettre}-${index}`}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  COULEUR_FORME[lettre] ?? "bg-bg-secondary text-text-tertiary"
                }`}
              >
                {lettre}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">
          {t("live.statistiques_buts_titre")}
        </h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={donneesButs}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
            <XAxis dataKey="nom" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="valeur" fill="#CC0000" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
