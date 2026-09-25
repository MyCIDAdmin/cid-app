/**
 * Animation "count-up" pour les kilomètres de kilomètres... pardon, les kilos de KPI chiffrés
 * (Modules Übersicht/Statistiken, demande utilisateur 2026-09-25 : "dynamischer und bewegender
 * Kacheln und Kennzahlen gestalten"). Anime la valeur affichée de son ancienne valeur vers la
 * nouvelle via requestAnimationFrame — aucune bibliothèque d'animation dans le projet (voir
 * tailwind.config.js), donc implémentation "à la main", cohérente avec l'unique animation CSS
 * existante (slide-in-fade du Live-Ticker).
 *
 * Respecte `prefers-reduced-motion` (accessibilité) : dans ce cas la valeur cible s'affiche
 * directement, sans transition.
 */
import { useEffect, useRef, useState } from "react";

const DUREE_MS = 700;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefereMouvementReduit(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * `cible` doit être un nombre fini pour être animée ; toute autre valeur (undefined, NaN,
 * chaîne comme "—" pendant le chargement) est retournée telle quelle, sans animation.
 */
export function useCountUp(cible: number | undefined | null): number | undefined | null {
  const [valeurAffichee, setValeurAffichee] = useState(cible);
  const precedenteRef = useRef(cible);
  const frameRef = useRef<number>();

  useEffect(() => {
    const depart = precedenteRef.current;
    precedenteRef.current = cible;

    if (
      cible == null ||
      !Number.isFinite(cible) ||
      depart == null ||
      !Number.isFinite(depart) ||
      depart === cible ||
      prefereMouvementReduit()
    ) {
      setValeurAffichee(cible);
      return undefined;
    }

    const debut = performance.now();
    const anime = (maintenant: number) => {
      const progression = Math.min(1, (maintenant - debut) / DUREE_MS);
      const valeur = depart + (cible - depart) * easeOutCubic(progression);
      setValeurAffichee(progression >= 1 ? cible : valeur);
      if (progression < 1) {
        frameRef.current = requestAnimationFrame(anime);
      }
    };
    frameRef.current = requestAnimationFrame(anime);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);

  return valeurAffichee;
}
