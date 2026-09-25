import { useRef, useState, useEffect, type ReactNode, type MouseEvent } from "react";

/**
 * Carte avec léger effet de bascule 3D au survol (suit la position de la souris) — repris de
 * MyCID (merge de design 2026-09-25, voir rapport "CID vs MyCID", section "Was wir von MyCID
 * übernehmen sollten"). Purement visuel, n'impose aucune structure interne : enveloppe le
 * contenu existant d'une carte (ex. une carte projet) sans changer son balisage.
 * Respecte `prefers-reduced-motion` (aucune bascule/ombre animée si l'utilisateur le demande).
 */
export default function Card3D({
  children,
  className = "",
  intensity = "medium",
}: {
  children: ReactNode;
  className?: string;
  intensity?: "low" | "subtle" | "medium" | "strong";
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [reduitAnimation, setReduitAnimation] = useState(false);
  const [survole, setSurvole] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduitAnimation(media.matches);
    const onChange = (e: MediaQueryListEvent) => setReduitAnimation(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const INTENSITE = { low: 0.3, subtle: 0.5, medium: 1, strong: 1.5 } as const;

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduitAnimation || !cardRef.current) return;
    const carte = cardRef.current;
    const rect = carte.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centreX = rect.width / 2;
    const centreY = rect.height / 2;
    const mult = INTENSITE[intensity];
    const rotateX = ((y - centreY) / centreY) * -3 * mult;
    const rotateY = ((x - centreX) / centreX) * 3 * mult;
    carte.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
  };

  const onMouseLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)";
    }
    setSurvole(false);
  };

  return (
    <div
      ref={cardRef}
      className={`transition-all duration-200 ease-out will-change-transform ${
        survole && !reduitAnimation ? "shadow-glow" : ""
      } ${className}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseEnter={() => setSurvole(true)}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </div>
  );
}
