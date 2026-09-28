import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

/**
 * Mémorise la page demandée avant redirection vers /login (retour utilisateur du 2026-09-27 :
 * "wenn ich auf Mitglieder werden springe ich zur Anmeldungsseite aber dann direkt auf
 * Übersicht" — cliquer sur le CTA "Mitglied werden" du hero, non connecté, renvoyait bien vers
 * /login mais l'atterrissage après connexion était toujours /dashboard, jamais la page
 * initialement visée). `state.from` porte l'objet `location` complet (pathname + search) ; il
 * est relayé par LoginPage.tsx (et via RegisterPage.tsx pour le détour inscription/confirmation)
 * jusqu'à la connexion effective, qui y redirige au lieu du /dashboard fixe.
 */
export default function RequireAuth({ children }: PropsWithChildren) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
