/**
 * Lien profond depuis une notification (ajouté le 2026-09-19, retour utilisateur : "Wenn ich
 * bei der Glocke ... auf eine Benachrichtigung klicke ... möchte ich direkt darauf springen").
 *
 * Les notifications backend (apps.notifications) pointent vers des pages LISTE — il n'existe pas
 * de route de détail dédiée pour un événement, un produit, une publication ou une session de vote
 * passée (voir App.tsx) — via un paramètre de requête (`?evenement=<id>`, `?publication=<id>`,
 * `?produit=<id>`, `?session=<id>`, `?commande=<id>`). Ce hook lit ce paramètre et fournit une
 * fonction de ref à poser sur l'élément de liste correspondant : une fois monté, l'élément est
 * scrollé en vue et brièvement mis en surbrillance (classe CSS `.cid-highlight-cible`, voir
 * index.css), pour que la personne retrouve visuellement l'élément visé par la notification
 * plutôt que d'atterrir sur une liste indifférenciée.
 *
 * Usage :
 *   const { cibleId, refCible } = useDeepLinkCible("evenement");
 *   ...
 *   <div ref={refCible(evenement.id)}>...</div>
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

export function useDeepLinkCible(param: string) {
  const [searchParams] = useSearchParams();
  const cibleId = searchParams.get(param);
  const [elementCible, setElementCible] = useState<HTMLElement | null>(null);
  const dejaScrolle = useRef(false);

  useEffect(() => {
    if (!cibleId || !elementCible || dejaScrolle.current) return;
    dejaScrolle.current = true;
    // Optionnel : jsdom (tests) n'implémente pas scrollIntoView, et un environnement d'exécution
    // exotique pourrait ne pas l'exposer non plus — la mise en évidence CSS ci-dessous reste
    // utile même sans le scroll automatique.
    elementCible.scrollIntoView?.({ behavior: "smooth", block: "center" });
    elementCible.classList.add("cid-highlight-cible");
    const timer = window.setTimeout(() => {
      elementCible.classList.remove("cid-highlight-cible");
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [cibleId, elementCible]);

  function refCible(id: string) {
    return (el: HTMLElement | null) => {
      if (id === cibleId) setElementCible(el);
    };
  }

  return { cibleId, refCible };
}
