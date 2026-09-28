/**
 * Page d'accueil publique façon https://www.mycid.org/ (demande utilisateur du 2026-09-26) —
 * rendue par HomeRoute.tsx pour tout visiteur/membre non-actif. Conteneur unique à onglets
 * pilotés par `?onglet=` (voir docstring PublicTopNav.tsx), même principe que
 * BoutiquePage/ProjetsPage/LiveMatchPage : PAS de routes dédiées, pour ne jamais entrer en
 * collision avec les routes authentifiées existantes (/evenements, /projets, /boutique, /albums).
 *
 * Onglets (plan sections C+D) :
 *   - "accueil" : hero, adhésion, kennzahlen, Fan-Club — voir AccueilTab.tsx.
 *   - "evenements" : kacheln façon mycid.org/events, 3 sous-onglets — voir PublicEvenementsTab.tsx.
 *   - "projets" / "shop" / "galerie" : embarquent RESPECTIVEMENT les pages membre existantes
 *     ProjetsPage/CataloguePage/AlbumsPage (déjà lisibles anonymement côté backend depuis la
 *     Phase Backend-Sichtbarkeit) — ProjetsPage/CataloguePage redirigent elles-mêmes vers
 *     /login au moment d'un acte d'écriture (contribuer/ajouter au panier) pour un visiteur
 *     anonyme, voir leurs docstrings respectives ; AlbumsPage est déjà purement lecture seule,
 *     embarquée sans aucune modification.
 *   - "apropos" : contenu statique reconstruit (pas un simple lien externe, demande utilisateur)
 *     — voir UeberUnsTab.tsx.
 */
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import AccueilTab from "../../components/public/AccueilTab";
import PublicEvenementsTab from "../../components/public/PublicEvenementsTab";
import PublicFooter from "../../components/public/PublicFooter";
import PublicTopNav, { type OngletPublic } from "../../components/public/PublicTopNav";
import UeberUnsTab from "../../components/public/UeberUnsTab";
import AlbumsPage from "../communaute/AlbumsPage";
import CataloguePage from "../boutique/CataloguePage";
import ProjetsPage from "../projets/ProjetsPage";

function ongletDepuisParam(valeur: string | null): OngletPublic {
  return valeur === "evenements" ||
    valeur === "projets" ||
    valeur === "shop" ||
    valeur === "galerie" ||
    valeur === "apropos"
    ? valeur
    : "accueil";
}

/** Enveloppe une page membre embarquée (ProjetsPage/CataloguePage/AlbumsPage) avec le même
 * gabarit d'espacement que le `<main className="p-6">` d'AppLayout — ces pages sont conçues pour
 * y vivre, jamais collées aux bords de la fenêtre. */
function PageEmbarquee({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl p-6">{children}</div>;
}

export default function PublicHomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const onglet = ongletDepuisParam(searchParams.get("onglet"));

  function changerOnglet(cible: OngletPublic) {
    const next = new URLSearchParams(searchParams);
    if (cible === "accueil") {
      next.delete("onglet");
    } else {
      next.set("onglet", cible);
    }
    setSearchParams(next);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-tertiary">
      <PublicTopNav onglet={onglet} onChangeOnglet={changerOnglet} />

      <main className="flex-1">
        {onglet === "accueil" && <AccueilTab />}
        {onglet === "evenements" && <PublicEvenementsTab />}
        {onglet === "projets" && (
          <PageEmbarquee>
            <ProjetsPage />
          </PageEmbarquee>
        )}
        {onglet === "shop" && (
          <PageEmbarquee>
            <CataloguePage />
          </PageEmbarquee>
        )}
        {onglet === "galerie" && (
          <PageEmbarquee>
            <AlbumsPage />
          </PageEmbarquee>
        )}
        {onglet === "apropos" && <UeberUnsTab />}
      </main>

      {/* Footer compact (retour utilisateur du 2026-09-28 : "Den dünnen Footer aus den Seiten der
          Modulen in die Startseite übernehmen") — la Startseite publique utilise désormais la
          même variante dense qu'AppLayout.tsx plutôt que la grille 3 colonnes pleine taille
          d'origine ; contenu strictement identique, voir docstring PublicFooter.tsx. */}
      <PublicFooter compact />
    </div>
  );
}
