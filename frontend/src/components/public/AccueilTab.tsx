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
 *   4. Banner "Unsere Sponsoren und Business Partner" (Nutzerwunsch 2026-10-07, SponsorenBanner.tsx)
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
import FanClubPreview from "./FanClubPreview";
import KennzahlenBar from "./KennzahlenBar";
import NextMatchTile from "./NextMatchTile";
import SponsorenBanner from "./SponsorenBanner";
import StartseiteKopf from "./StartseiteKopf";

export default function AccueilTab() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6">
      <StartseiteKopf />
      <NextMatchTile />
      <KennzahlenBar />
      <FanClubPreview />
      <SponsorenBanner />
    </div>
  );
}
