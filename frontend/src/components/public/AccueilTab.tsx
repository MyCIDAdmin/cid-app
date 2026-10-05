/**
 * Contenu de l'onglet "Startseite" de la page d'accueil publique (demande utilisateur du
 * 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C) — dans l'ordre exact demandé :
 *   1. Hero (bannière + CTA "Mitglied werden" → /mon-adhesion ; PAS de boutons "Projekte"/
 *      "Veranstaltungen", déjà des onglets de la nav, voir docstring PublicTopNav.tsx) — fond
 *      vidéo optionnel depuis le 2026-09-27 (Phase 5 "Startseite Hero-Video", voir HeroVideo.tsx)
 *   1bis. Kachel "Nächstes Spiel" (retour utilisateur du 2026-09-28 :
 *      "Nächstes-Spiel-Highlight-Kachel auf der Startseite") — voir NextMatchTile.tsx,
 *      n'affiche rien tant qu'aucune rencontre à venir n'est connue.
 *   2. Kennzahlen (Donateurs/Collecté/Projets)
 *   3. Fan-Club (classement + calendrier, réutilisation pure du module existant)
 * Le point "Aktives Projekt" du mockup mycid.org n'est PAS repris ici (décision utilisateur
 * explicite, point 2.1.6) — le footer applicatif est déjà posé par PublicHomePage.tsx.
 *
 * Pas de section "Adhésion" ici (retour utilisateur du 2026-09-27 : "Mitgliedschaft Kampagne
 * soll ausgeblendet sein" — la carte d'offres façon mycid.org/membership, encore présente sur la
 * page tant que le rapport de bug n'était pas confirmé, restait visible directement sur la
 * Startseite, ce qui n'était pas le comportement demandé). Le CTA "Mitglied werden" du hero
 * ci-dessous reste le seul point d'entrée vers l'adhésion : il mène à /mon-adhesion, qui affiche
 * désormais elle-même les offres dans ce même style de cartes (voir MonAdhesionPage.tsx) — donc
 * aucune perte de fonctionnalité, seulement un clic de plus avant de voir les offres, comme
 * demandé. MembershipSection/MembershipOffersPublic restent dans le code (testées, inchangées)
 * au cas où une future demande voudrait les remontrer ailleurs.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import FanClubPreview from "./FanClubPreview";
import HeroKacheln from "./HeroKacheln";
import HeroVideo from "./HeroVideo";
import KennzahlenBar from "./KennzahlenBar";
import MitgliedWerdenVorschau from "./MitgliedWerdenVorschau";
import NextMatchTile from "./NextMatchTile";
import { useConfigurationSitePublic } from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";

export default function AccueilTab() {
  const { t } = useTranslation("public");
  const { data: configuration } = useConfigurationSitePublic();
  const videoUrl = configuration?.video_hero ?? null;
  const isAuthenticated = useAuthStore((st) => st.isAuthenticated);
  const [vorschauOuverte, setVorschauOuverte] = useState(false);
  const classeCta = videoUrl
    ? "mt-6 inline-block rounded-cid bg-white px-5 py-2.5 text-sm font-semibold text-ca transition hover:bg-white/90"
    : "mt-6 inline-block rounded-cid bg-ca px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cad";

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6">
      <div
        className={
          videoUrl
            ? "relative overflow-hidden rounded-cid-lg bg-gradient-to-br from-ca to-cad px-6 py-12 sm:px-10"
            : "py-10"
        }
      >
        {videoUrl && <HeroVideo videoUrl={videoUrl} />}
        {/* Centré façon mycid.org (retour utilisateur du 2026-09-27 : "gleiche Seitenausrichtung:
            Zentriert", "Button 'Mitglieder werden' Soll auch zentriert sein") — colonne flex
            centrée plutôt que le bloc aligné à gauche d'origine ; `.stagger-children` (utilitaire
            déjà existant, voir index.css, utilisé par CataloguePage/ProjetsPage) applique la même
            apparition échelonnée (fade-up) au titre/sous-titre/CTA, façon mycid.org. */}
        <div
          className={`stagger-children relative mx-auto flex max-w-2xl flex-col items-center text-center ${
            videoUrl ? "glass-panel rounded-cid-lg p-6" : ""
          }`}
        >
          <h1
            className={`font-display text-3xl font-bold sm:text-4xl ${
              videoUrl ? "text-white" : "text-text-primary"
            }`}
          >
            {t("hero.titre")}
          </h1>
          <p className={`mt-3 text-base ${videoUrl ? "text-white/85" : "text-text-secondary"}`}>
            {t("hero.sous_titre")}
          </p>
          {/* Point 10 (2026-10-06) : un visiteur voit d'abord l'aperçu de la campagne en cours,
              puis seulement la page de connexion ; un connecté va directement à son adhésion. */}
          {isAuthenticated ? (
            <Link to="/mon-adhesion" className={classeCta}>
              {t("hero.cta_mitglied_werden")}
            </Link>
          ) : (
            <button type="button" onClick={() => setVorschauOuverte(true)} className={classeCta}>
              {t("hero.cta_mitglied_werden")}
            </button>
          )}
        </div>
      </div>

      <HeroKacheln config={configuration} />
      {vorschauOuverte && <MitgliedWerdenVorschau onClose={() => setVorschauOuverte(false)} />}
      <NextMatchTile />
      <KennzahlenBar />
      <FanClubPreview />
    </div>
  );
}
