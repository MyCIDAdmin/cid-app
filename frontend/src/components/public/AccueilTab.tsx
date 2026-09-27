/**
 * Contenu de l'onglet "Startseite" de la page d'accueil publique (demande utilisateur du
 * 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C) — dans l'ordre exact demandé :
 *   1. Hero (bannière + CTA "Mitglied werden" → /mon-adhesion ; PAS de boutons "Projekte"/
 *      "Veranstaltungen", déjà des onglets de la nav, voir docstring PublicTopNav.tsx) — fond
 *      vidéo optionnel depuis le 2026-09-27 (Phase 5 "Startseite Hero-Video", voir HeroVideo.tsx)
 *   2. Adhésion (MembershipSection — offres façon mycid.org/membership OU récapitulatif "déjà
 *      membre" selon la souscription en cours)
 *   3. Kennzahlen (Donateurs/Collecté/Projets)
 *   4. Fan-Club (classement + calendrier, réutilisation pure du module existant)
 * Le point "Aktives Projekt" du mockup mycid.org n'est PAS repris ici (décision utilisateur
 * explicite, point 2.1.6) — le footer applicatif est déjà posé par PublicHomePage.tsx.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import FanClubPreview from "./FanClubPreview";
import HeroVideo from "./HeroVideo";
import KennzahlenBar from "./KennzahlenBar";
import MembershipSection from "./MembershipSection";
import { useConfigurationSitePublic } from "../../hooks/useCommunaute";

export default function AccueilTab() {
  const { t } = useTranslation("public");
  const { data: configuration } = useConfigurationSitePublic();
  const videoUrl = configuration?.video_hero ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6">
      <div
        className={
          videoUrl
            ? "relative overflow-hidden rounded-cid-lg bg-gradient-to-br from-ca to-cad px-6 py-16 sm:px-10"
            : "py-10"
        }
      >
        {videoUrl && <HeroVideo videoUrl={videoUrl} />}
        {/* Centré façon mycid.org (retour utilisateur du 2026-09-27 : "gleiche Seitenausrichtung:
            Zentriert", "Button 'Mitglieder werden' Soll auch zentriert sein") — colonne flex
            centrée plutôt que le bloc aligné à gauche d'origine ; `.stagger-children` (utilitaire
            déjà existant, voir index.css, utilisé par CataloguePage/ProjetsPage) applique la même
            apparition échelonnée (fade-up) au titre/sous-titre/CTA, façon mycid.org. */}
        <div className="stagger-children relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <h1
            className={`font-display text-3xl font-bold sm:text-4xl ${
              videoUrl ? "text-white" : "text-text-primary"
            }`}
          >
            {t("hero.titre")}
          </h1>
          <p
            className={`mt-3 text-base ${videoUrl ? "text-white/85" : "text-text-secondary"}`}
          >
            {t("hero.sous_titre")}
          </p>
          <Link
            to="/mon-adhesion"
            className={
              videoUrl
                ? "mt-6 inline-block rounded-cid bg-white px-5 py-2.5 text-sm font-semibold text-ca transition hover:bg-white/90"
                : "mt-6 inline-block rounded-cid bg-ca px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cad"
            }
          >
            {t("hero.cta_mitglied_werden")}
          </Link>
        </div>
      </div>

      <MembershipSection />
      <KennzahlenBar />
      <FanClubPreview />
    </div>
  );
}
