import { useLocation } from "react-router-dom";

import { useArrierePlansModules } from "../../hooks/useCommunaute";
import { getModuleForPath } from "./Sidebar";

/**
 * Image de fond scalée par module (demande utilisateur du 2026-09-29 : "Im Modul 'Hero
 * Video' es soll möglich sein Hintergrund Bilder pro Modul (außer in der Kategorie
 * Verwaltung) hochzuladen. Die Hochladene Bilder sollen skaliert als Hintergrund für die
 * Seite des Moduls dargestellt werden") — purement présentationnel, la liste des images
 * (ArrierePlanModule) est gérée/uploadée depuis AdminConfigurationSitePage.tsx.
 *
 * Rend TOUJOURS le fond de base `bg-bg-tertiary` (même token que l'ancien fond fixe de
 * `<main>`, désormais déplacé ici — voir AppLayout.tsx) — un module sans image configurée,
 * ou une page hors NAV_ITEMS (`getModuleForPath` renvoie `null`), garde donc un rendu
 * pixel-identique à avant cette fonctionnalité. AUCUN item du groupe "administration" ne
 * renseigne `module` (voir docstring getModuleForPath) : la catégorie Verwaltung est donc
 * automatiquement exclue, exactement comme demandé.
 *
 * `object-cover` + `absolute inset-0` recadre/scale l'image pour toujours couvrir
 * l'intégralité de la zone disponible, quel que soit son ratio d'origine ("skaliert als
 * Hintergrund"). Superposition `bg-bg-tertiary/85` (même token que le fond par défaut, à
 * opacité élevée) plutôt qu'un dégradé directionnel façon HeroVideo.tsx : ce fond couvre
 * toute la page (pas seulement une bande de texte de hero), donc l'ensemble du contenu
 * (cartes, tableaux, texte) doit rester lisible par-dessus, dans les deux thèmes clair/
 * sombre — un simple assombrissement directionnel ne suffirait pas ici.
 *
 * Positionné en `-z-10` à l'intérieur de la colonne de droite d'AppLayout (qui porte
 * `relative` + est bornée à `h-screen`/`overflow-hidden`, voir AppLayout.tsx) plutôt que dans
 * `<main>` lui-même (qui défile en interne) : un `absolute inset-0` posé directement dans
 * `<main>` se dimensionnerait sur la hauteur totale du CONTENU scrollable (potentiellement
 * bien plus grande qu'un écran), étirant/recadrant l'image de façon incohérente ; posé au
 * niveau de la colonne (dont la hauteur reste toujours celle du viewport), l'image de fond
 * reste stable pendant le défilement de `<main>`, comme un vrai fond de page.
 */
export default function ModuleBackground() {
  const location = useLocation();
  const module = getModuleForPath(location.pathname);
  const { data: arrierePlans } = useArrierePlansModules();
  const arrierePlan = module ? arrierePlans?.find((item) => item.module === module) : undefined;

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-bg-tertiary" aria-hidden="true">
      {arrierePlan && (
        <>
          <img
            key={arrierePlan.image}
            data-testid="module-background-image"
            src={arrierePlan.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-bg-tertiary/85" />
        </>
      )}
    </div>
  );
}
