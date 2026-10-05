/**
 * Kennzahlen "Donators / Gesammelt / Projekte" de l'onglet "Startseite" (demande utilisateur du
 * 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C.3) — GET
 * /projets/projets/kennzahlen/, ouvert à tout le monde (voir ProjetViewSet.kennzahlen).
 */
import { useTranslation } from "react-i18next";

import { useKennzahlenProjets } from "../../hooks/useProjets";
import AnimatedNumber from "../ui/AnimatedNumber";

function formatMontant(nombre: number): string {
  return `${nombre.toLocaleString("de-DE")} €`;
}

function formatNombre(nombre: number): string {
  return String(nombre);
}

export default function KennzahlenBar() {
  const { t } = useTranslation("public");
  const { data } = useKennzahlenProjets();

  const stats: { labelKey: string; valeur: number | null; format: (n: number) => string }[] = [
    { labelKey: "kennzahlen.donateurs", valeur: data?.nb_donateurs ?? null, format: formatNombre },
    {
      labelKey: "kennzahlen.collecte",
      valeur: data ? Math.round(Number(data.montant_collecte)) : null,
      format: formatMontant,
    },
    { labelKey: "kennzahlen.projets", valeur: data?.nb_projets ?? null, format: formatNombre },
  ];

  return (
    <div className="card-lift grid grid-cols-3 gap-4 rounded-cid-lg bg-bg-primary p-6 shadow-sm">
      {stats.map((stat) => (
        <div key={stat.labelKey} className="text-center">
          <div className="font-display text-2xl font-bold text-ca sm:text-3xl">
            {stat.valeur === null ? "—" : <AnimatedNumber value={stat.valeur} format={stat.format} />}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary sm:text-xs">
            {t(stat.labelKey)}
          </div>
        </div>
      ))}
    </div>
  );
}
