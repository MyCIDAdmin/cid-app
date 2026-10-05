/**
 * Route "/" (demande utilisateur du 2026-09-26 : "Die Startseite aus https://www.mycid.org/ als
 * startseite in my-cid.com übernehmen"), adaptée le 2026-10-05 (point 1.2 : "Nach der Anmeldung
 * bleibt der User auf der Startseite, aber die horizontale Menüleiste soll verschwinden") :
 *   - visiteur non connecté : Startseite publique complète (PublicHomePage, avec PublicTopNav) ;
 *   - utilisateur connecté (membre ou non) : il RESTE sur "/", mais dans l'AppLayout (Sidebar)
 *     — la barre horizontale publique disparaît, le contenu d'accueil (AccueilTab) est rendu
 *     comme route index de ce layout (voir App.tsx).
 */
import RequireAuth from "../../components/RequireAuth";
import AppLayout from "../../components/layout/AppLayout";
import { useAuthStore } from "../../store/authStore";
import PublicHomePage from "./PublicHomePage";

export default function HomeRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <PublicHomePage />;
  }
  return (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  );
}
