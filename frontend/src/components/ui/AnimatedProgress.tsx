import { useEffect, useRef, useState } from "react";

/**
 * Barre de progression qui s'anime de 0 à `value` dès qu'elle entre dans le viewport (repris de
 * MyCID, merge de design 2026-09-25 — voir rapport "CID vs MyCID"). Aucune dépendance à une
 * bibliothèque de composants (contrairement à l'original MyCID qui utilisait le composant
 * shadcn/ui `Progress`, absent de CID) : simple `<div>` avec largeur animée en pourcentage,
 * cohérent avec le style déjà utilisé pour les barres de progression existantes (ex. objectifs
 * de collecte des projets).
 */
export default function AnimatedProgress({
  value,
  className = "",
  afficherPourcentage = false,
  duree = 1000,
}: {
  /** Valeur cible entre 0 et 100. */
  value: number;
  className?: string;
  afficherPourcentage?: boolean;
  duree?: number;
}) {
  const [valeurAffichee, setValeurAffichee] = useState(0);
  const [dejaAnime, setDejaAnime] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !dejaAnime) {
          setDejaAnime(true);
          const debut = Date.now();
          const animer = () => {
            const ecoule = Date.now() - debut;
            const progression = Math.min(ecoule / duree, 1);
            // Ease-out cubique — même formule que l'original MyCID.
            const attenuee = 1 - Math.pow(1 - progression, 3);
            setValeurAffichee(Math.round(attenuee * value));
            if (progression < 1) requestAnimationFrame(animer);
          };
          requestAnimationFrame(animer);
        }
      },
      { threshold: 0.2 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duree, dejaAnime]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-ca transition-[width] duration-300"
          style={{ width: `${Math.min(valeurAffichee, 100)}%` }}
        />
      </div>
      {afficherPourcentage && (
        <span className="absolute -top-6 right-0 text-sm font-medium text-text-primary">
          {valeurAffichee}%
        </span>
      )}
    </div>
  );
}
