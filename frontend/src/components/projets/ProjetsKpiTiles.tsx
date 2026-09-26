import { useTranslation } from "react-i18next";

import type { Projet } from "../../types/projets";

function formatMontant(montant: number): string {
  return `${montant.toFixed(2).replace(".", ",")} €`;
}

/**
 * Bandeau de statistiques (demande utilisateur 2026-09-26 : porter la structure de
 * https://www.mycid.org/projects — 4 tuiles "Total Projects / Active / Completed / Total
 * Raised" au-dessus de la grille). Calculé côté client à partir de la liste de projets déjà
 * chargée par la page (`useProjets()`, sans filtre de statut) : ProjetsCursorPagination
 * (page_size=20 côté backend, voir apps/projets/views.py) couvre largement le nombre de projets
 * réels de l'association (10 sur la référence mycid.org) — pas de nouvel endpoint d'agrégation
 * pour un simple total d'affichage, cohérent avec le principe "ne pas ajouter de travail backend
 * non demandé". Chaque montant collecté vient déjà du serveur (Projet.montant_collecte, toujours
 * recalculé côté backend, voir CLAUDE.md §8) : additionner des valeurs déjà dignes de confiance
 * pour un total en LECTURE seule n'est pas le genre de recalcul client que CLAUDE.md §8 proscrit
 * (qui vise le montant final d'une transaction, jamais un total d'affichage agrégé).
 */
export default function ProjetsKpiTiles({ projets }: { projets: Projet[] }) {
  const { t } = useTranslation("projets");

  const total = projets.length;
  const actifs = projets.filter((p) => p.statut === "en_cours").length;
  const termines = projets.filter((p) => p.statut === "termine").length;
  const totalCollecte = projets.reduce((somme, p) => somme + Number(p.montant_collecte || 0), 0);

  const tuiles = [
    { libelle: t("kpi.total"), valeur: String(total), couleur: "text-ca" },
    { libelle: t("kpi.actifs"), valeur: String(actifs), couleur: "text-status-successText" },
    { libelle: t("kpi.termines"), valeur: String(termines), couleur: "text-text-primary" },
    { libelle: t("kpi.total_collecte"), valeur: formatMontant(totalCollecte), couleur: "text-ca" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tuiles.map((tuile) => (
        <div
          key={tuile.libelle}
          className="rounded-cid-lg border border-text-tertiary/20 bg-card-gradient p-4 text-center shadow-card"
        >
          <p className={`font-display text-2xl font-bold ${tuile.couleur}`}>{tuile.valeur}</p>
          <p className="mt-1 text-xs text-text-secondary">{tuile.libelle}</p>
        </div>
      ))}
    </div>
  );
}
