import { useEffect, useRef, useState } from "react";

/**
 * Compteur animé (Glas-Design, 2026-10-06 : "Zahlen zählen hoch"). Compte de la valeur affichée
 * jusqu'à `value` avec une courbe ease-out cubique. Sans animation (valeur finale immédiate)
 * quand l'utilisateur a demandé moins de mouvement (`prefers-reduced-motion`) ou quand
 * `matchMedia` n'existe pas (jsdom dans les tests) — le texte final est donc toujours celui que
 * les tests existants attendent, sans fausse intermédiaire.
 */
function mouvementReduit(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  /** Durée de l'animation en millisecondes. */
  duration?: number;
}

export default function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString("de-DE"),
  duration = 900,
}: AnimatedNumberProps) {
  const [affiche, setAffiche] = useState(() => (mouvementReduit() ? value : 0));
  const depart = useRef(affiche);

  useEffect(() => {
    if (mouvementReduit()) {
      depart.current = value;
      setAffiche(value);
      return;
    }
    const debut = performance.now();
    const de = depart.current;
    let cadre = 0;
    const tick = (maintenant: number) => {
      const p = Math.min(1, (maintenant - debut) / duration);
      const facile = 1 - Math.pow(1 - p, 3);
      const courant = Math.round(de + (value - de) * facile);
      depart.current = courant;
      setAffiche(courant);
      if (p < 1) cadre = requestAnimationFrame(tick);
    };
    cadre = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(cadre);
  }, [value, duration]);

  return <>{format(affiche)}</>;
}
