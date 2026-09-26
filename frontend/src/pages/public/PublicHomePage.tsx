/**
 * Page d'accueil publique façon https://www.mycid.org/ (demande utilisateur du 2026-09-26) —
 * rendue par HomeRoute.tsx pour tout visiteur/membre non-actif. Conteneur unique à onglets
 * pilotés par `?onglet=` (voir docstring PublicTopNav.tsx), même principe que
 * BoutiquePage/ProjetsPage/LiveMatchPage : PAS de routes dédiées, pour ne jamais entrer en
 * collision avec les routes authentifiées existantes (/evenements, /projets, /boutique, /albums).
 *
 * Ce fichier pose le SQUELETTE (plan section A+B, tâche "Grundgerüst") : la barre de nav, le
 * pied de page et la mécanique d'onglets. Le contenu réel de chaque onglet arrive par des
 * commits séparés et suit exactement le plan :
 *   - "accueil"    : section C (hero, adhésion, kennzahlen, Fan-Club, footer déjà présent ici)
 *   - "evenements" / "projets" / "shop" / "galerie" / "apropos" : section D
 * D'ici là, un onglet non encore construit affiche un espace réservé sobre plutôt qu'une page
 * vide — jamais un onglet manquant dans la nav elle-même (voir ONGLETS dans PublicTopNav.tsx).
 */
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import PublicFooter from "../../components/public/PublicFooter";
import PublicTopNav, { type OngletPublic } from "../../components/public/PublicTopNav";

function ongletDepuisParam(valeur: string | null): OngletPublic {
  return valeur === "evenements" ||
    valeur === "projets" ||
    valeur === "shop" ||
    valeur === "galerie" ||
    valeur === "apropos"
    ? valeur
    : "accueil";
}

function EspaceReserve({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation("public");
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-24 text-center sm:px-6">
      <p className="text-lg font-semibold text-text-primary">{t(labelKey)}</p>
      <p className="text-sm text-text-tertiary">{t("onglet_a_venir.description")}</p>
    </div>
  );
}

export default function PublicHomePage() {
  const { t } = useTranslation("public");
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
        {onglet === "accueil" && (
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h1 className="font-display text-3xl font-bold text-text-primary sm:text-4xl">
              {t("hero.titre")}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-text-secondary">{t("hero.sous_titre")}</p>
            <Link
              to="/mon-adhesion"
              className="mt-6 inline-block rounded-cid bg-ca px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cad"
            >
              {t("hero.cta_mitglied_werden")}
            </Link>
          </div>
        )}
        {onglet === "evenements" && <EspaceReserve labelKey="nav.evenements" />}
        {onglet === "projets" && <EspaceReserve labelKey="nav.projets" />}
        {onglet === "shop" && <EspaceReserve labelKey="nav.shop" />}
        {onglet === "galerie" && <EspaceReserve labelKey="nav.galerie" />}
        {onglet === "apropos" && <EspaceReserve labelKey="nav.apropos" />}
      </main>

      <PublicFooter />
    </div>
  );
}
