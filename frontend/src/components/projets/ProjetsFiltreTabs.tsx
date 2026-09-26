import { useTranslation } from "react-i18next";

/** Filtre affiché sur la page membre — volontairement plus restreint que StatutProjet (4 valeurs
 * côté backend, voir types/projets.ts) : "annule" n'a pas d'onglet dédié sur mycid.org (binaire
 * Active/Completed), il reste seulement visible sous "tous" ici, cohérent avec l'original. */
export type FiltreProjet = "tous" | "actifs" | "termines";

const FILTRES: FiltreProjet[] = ["tous", "actifs", "termines"];

/**
 * Onglets de filtre "All Projects / Active / Completed" (demande utilisateur 2026-09-26 : porter
 * la structure de https://www.mycid.org/projects sur /projets). Filtre purement côté client sur
 * la liste déjà chargée par ProjetsKpiTiles/ProjetsPage (même liste, mêmes 20 projets max — voir
 * docstring ProjetsKpiTiles) plutôt qu'un aller-retour serveur par onglet.
 */
export default function ProjetsFiltreTabs({
  valeur,
  onChange,
}: {
  valeur: FiltreProjet;
  onChange: (filtre: FiltreProjet) => void;
}) {
  const { t } = useTranslation("projets");

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {FILTRES.map((filtre) => (
        <button
          key={filtre}
          type="button"
          onClick={() => onChange(filtre)}
          aria-pressed={valeur === filtre}
          className={`rounded-cid px-4 py-1.5 text-sm font-medium transition-colors ${
            valeur === filtre
              ? "bg-ca text-white"
              : "border border-text-tertiary/30 text-text-secondary hover:bg-bg-secondary"
          }`}
        >
          {t(`filtre.${filtre}`)}
        </button>
      ))}
    </div>
  );
}
