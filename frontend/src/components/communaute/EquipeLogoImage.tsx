/**
 * Petit logo de club affiché à côté d'un nom d'équipe — Tabelle (ClassementTab.tsx),
 * Spielplan (CalendrierTab.tsx) et kachel "Nächstes Spiel" (NextMatchTile.tsx). Retour
 * utilisateur du 2026-09-28 : "Fan-Club: Vereins-Logos anzeigen + Upload-Möglichkeit".
 *
 * Recherche le logo par correspondance EXACTE de `equipe` (voir docstring de tête
 * apps.communaute.models.EquipeLogo — aucune clé étrangère, juste une chaîne identique à
 * celle synchronisée par GOAL API) dans `useEquipesLogos()` (une seule requête réseau,
 * partagée entre tous les usages via le cache React Query — queryKey identique). N'affiche
 * rien (pas d'icône "image cassée") tant qu'aucun logo n'a été téléversé pour ce nom.
 */
import { useMemo } from "react";

import { useEquipesLogos } from "../../hooks/useCommunaute";

export default function EquipeLogoImage({
  equipe,
  className = "h-5 w-5 shrink-0 rounded-full object-contain",
}: {
  equipe: string;
  className?: string;
}) {
  const { data } = useEquipesLogos();

  const logo = useMemo(() => data?.find((l) => l.equipe === equipe) ?? null, [data, equipe]);

  if (!logo) return null;

  return <img src={logo.logo} alt="" className={className} />;
}
