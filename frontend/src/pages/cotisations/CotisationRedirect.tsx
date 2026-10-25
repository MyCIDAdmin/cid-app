/**
 * Redirect de compatibilité pour l'ancienne route /cotisation (Phase F, 2026-09-26 —
 * fusion "Mitgliedsbeitrag" -> "Meine Mitgliedschaft" : voir PaiementStepper.tsx et
 * MonAdhesionPage.tsx). Le contenu de l'ex-CotisationStepperPage vit désormais entièrement
 * sous /mon-adhesion ; cette route reste techniquement présente (elle n'est PAS retirée de
 * App.tsx) uniquement pour que les deep-links existants depuis Événements/Projets
 * (`navigate("/cotisation?paiement=...")`, voir EvenementsPage.tsx, PublicEvenementsTab.tsx,
 * ProjetsPage.tsx, ProjetDetailPage.tsx) continuent de fonctionner sans devoir modifier
 * chacun de ces appelants.
 */
import { Navigate, useSearchParams } from "react-router-dom";

export default function CotisationRedirect() {
  const [params] = useSearchParams();
  const paiement = params.get("paiement");
  // Beitragsaktionen : Erinnerungen und Hinweise verlinken `/cotisation?aktion=<id>`.
  const aktion = params.get("aktion");

  let ziel = "/mon-adhesion";
  if (paiement) ziel = `/mon-adhesion?paiement=${encodeURIComponent(paiement)}`;
  else if (aktion) ziel = `/mon-adhesion?aktion=${encodeURIComponent(aktion)}`;

  return <Navigate to={ziel} replace />;
}
