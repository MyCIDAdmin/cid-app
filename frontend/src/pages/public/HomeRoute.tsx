/**
 * Route "/" (demande utilisateur du 2026-09-26 : "Die Startseite aus https://www.mycid.org/ als
 * startseite in my-cid.com übernehmen. Die soll die aktuelle Anmeldungsseite ersetzen") — voir
 * plan "Öffentliche mycid.org-Startseite, horizontale Navigation, Event-Sichtbarkeit,
 * Mitgliedschaft-Merge", section A.
 *
 * Règle (décision utilisateur, section "Die Sidebard soll nur für Aktive Mitglieder sichtbar
 * sein") :
 *   - non connecté                                        → PublicHomePage (visiteur)
 *   - connecté, fiche Membre liée avec statut !== "actif"  → PublicHomePage (traité comme un
 *     visiteur — la barre horizontale, pas la sidebar, tant que son adhésion n'est pas active)
 *   - connecté, statut_membre === "actif" OU aucune fiche Membre liée (superuser, RH créé hors
 *     auto-inscription) → redirige vers /dashboard, comportement inchangé. Le cas "aucune fiche
 *     liée" n'est PAS un visiteur : c'est un compte de gestion (rh/bureau_admin/...) qui a
 *     toujours besoin de la sidebar, la demande utilisateur ne visait que l'expérience membre
 *     ordinaire — voir docstring UserSerializer.get_statut_membre côté backend.
 */
import { Navigate } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";
import PublicHomePage from "./PublicHomePage";

export default function HomeRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const estVisiteur =
    !isAuthenticated ||
    (user?.statut_membre !== undefined &&
      user.statut_membre !== null &&
      user.statut_membre !== "actif");

  if (estVisiteur) {
    return <PublicHomePage />;
  }
  return <Navigate to="/dashboard" replace />;
}
