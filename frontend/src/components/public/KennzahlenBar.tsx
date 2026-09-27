/**
 * Kennzahlen "Donators / Gesammelt / Projekte" de l'onglet "Startseite" (demande utilisateur du
 * 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C.3) — GET
 * /projets/projets/kennzahlen/, ouvert à tout le monde (voir ProjetViewSet.kennzahlen).
 */
import { useTranslation } from "react-i18next";

import { useKennzahlenProjets } from "../../hooks/useProjets";

function formatMontant(montant: string): string {
  const nombre = Math.round(Number(montant));
  return `${nombre.toLocaleString("de-DE")} €`;
}

export default function KennzahlenBar() {
  const { t } = useTranslation("public");
  const { data } = useKennzahlenProjets();

  const stats: { labelKey: string; valeur: string | number }[] = [
    { labelKey: "kennzahlen.donateurs", valeur: data?.nb_donateurs ?? "—" },
    { labelKey: "kennzahlen.collecte", valeur: data ? formatMontant(data.montant_collecte) : "—" },
    { labelKey: "kennzahlen.projets", valeur: data?.nb_projets ?? "—" },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 rounded-cid-lg bg-bg-primary p-6 shadow-sm">
      {stats.map((stat) => (
        <div key={stat.labelKey} className="text-center">
          <div className="font-display text-2xl font-bold text-ca sm:text-3xl">
            {stat.valeur}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary sm:text-xs">
            {t(stat.labelKey)}
          </div>
        </div>
      ))}
    </div>
  );
}
