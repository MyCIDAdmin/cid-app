/**
 * Reflet lumineux du Glas-Design (2026-10-06) : écrit la position de la souris, relative à la
 * carte survolée, dans les variables CSS --mx/--my que index.css utilise pour le dégradé radial
 * affiché au survol. Un seul écouteur délégué sur le document (pas de hook par carte), limité à
 * une mise à jour par image d'animation. Inactif pour les écrans tactiles et quand l'utilisateur
 * a demandé moins de mouvement ; renvoie la fonction de nettoyage.
 */
export const SELECTEUR_CARTES = ".rounded-cid-lg.bg-bg-primary.shadow-sm, .card-lift";

export function initGlassPointer(doc: Document = document): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return () => {};
  }

  let cadre = 0;
  let dernier: MouseEvent | null = null;

  const traiter = () => {
    cadre = 0;
    if (!dernier) return;
    const cible = (dernier.target as Element | null)?.closest?.(SELECTEUR_CARTES) as HTMLElement | null;
    if (!cible) return;
    const rect = cible.getBoundingClientRect();
    cible.style.setProperty("--mx", `${dernier.clientX - rect.left}px`);
    cible.style.setProperty("--my", `${dernier.clientY - rect.top}px`);
  };

  const onMove = (e: MouseEvent) => {
    dernier = e;
    if (!cadre) cadre = requestAnimationFrame(traiter);
  };

  doc.addEventListener("pointermove", onMove as EventListener, { passive: true });
  return () => {
    doc.removeEventListener("pointermove", onMove as EventListener);
    if (cadre) cancelAnimationFrame(cadre);
  };
}
