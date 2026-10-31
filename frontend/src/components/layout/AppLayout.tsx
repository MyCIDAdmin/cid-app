import { IconMenu2 } from "@tabler/icons-react";
import HelpButton from "./HelpButton";
import HelpPanel from "./HelpPanel";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";

import { usePanierReservierung } from "../../hooks/usePanierReservierung";
import PublicFooter from "../public/PublicFooter";
import LanguageSwitcher from "./LanguageSwitcher";
import MobileNavDrawer from "./MobileNavDrawer";
import ModuleBackground from "./ModuleBackground";
import NotificationBell from "./NotificationBell";
import Sidebar, { getGroupForPath } from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";

// Groupes Sidebar sous lesquels le PublicFooter apparaît aussi dans l'app connectée (décision
// utilisateur du 2026-09-26, "Auch in der eingeloggten App") — jamais "administration", ni les
// pages qui ne correspondent à aucun NAV_ITEMS (getGroupForPath renvoie alors `null`).
const GROUPES_AVEC_FOOTER = new Set(["general", "communaute", "contenu"]);

// Seiten, die die ganze Höhe des Inhaltsbereichs ausfüllen (Messenger-Aufbau mit fester Höhe) :
// ein Footer am Ende würde dort einen Scrollbalken erzeugen, deshalb ohne Footer.
const PAGES_PLEINE_HAUTEUR = ["/chats"];

export default function AppLayout() {
  const { t } = useTranslation("common");
  const location = useLocation();
  // Warenkorb-Reservierung (2026-10-20) serverseitig synchron halten, auf jeder Seite.
  usePanierReservierung();
  // État purement local (jamais dans uiStore, voir docstring MobileNavDrawer) : un tiroir doit
  // toujours redémarrer fermé, contrairement au repli de la sidebar desktop qui est une vraie
  // préférence persistée.
  const [tiroirMobileOuvert, setTiroirMobileOuvert] = useState(false);

  const groupe = getGroupForPath(location.pathname);
  const afficherFooter =
    groupe !== null &&
    GROUPES_AVEC_FOOTER.has(groupe) &&
    !PAGES_PLEINE_HAUTEUR.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    );

  return (
    // h-screen (pas min-h-screen) + min-h-0 sur la colonne de droite (retour utilisateur du
    // 2026-09-27 : "Side Bar nach dem Login ist abgeschnitten und geht nicht bis zum End der
    // Seite") : la colonne de droite (header + <main> scrollable + PublicFooter éventuel) est un
    // enfant flex sans hauteur explicite, dont la hauteur minimale par défaut est celle de son
    // contenu ("min-height: auto") — dès que ce contenu dépasse un écran (notamment avec le
    // PublicFooter ajouté sous <main>), la colonne grandissait au-delà de 100vh et entraînait tout
    // le document avec elle, alors que <Sidebar> garde une hauteur fixe (`h-screen`, voir
    // Sidebar.tsx) : elle ne suivait donc plus jusqu'en bas de la page ainsi allongée. `min-h-0`
    // autorise la colonne à se contracter à la hauteur disponible, pour que ce soit bien <main>
    // (overflow-y-auto) qui défile en interne, jamais le document — la sidebar reste alors
    // toujours alignée sur exactement 100vh, quelle que soit la longueur de la page.
    <div className="ambient-bg flex h-screen">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-cid focus:bg-bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-text-primary focus:shadow-lg"
      >
        {t("action.aller_contenu")}
      </a>
      <Sidebar />
      <MobileNavDrawer open={tiroirMobileOuvert} onClose={() => setTiroirMobileOuvert(false)} />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Image de fond par module (demande utilisateur du 2026-09-29, voir docstring
            ModuleBackground.tsx) — remplace l'ancien fond fixe `bg-bg-tertiary` de <main>
            ci-dessous, désormais toujours transparent (le token de couleur vit ici). */}
        <ModuleBackground />
        {/* Topbar (mockup .topbar) — cloche de notifications (Phase 2B), sélecteur de langue et
            bascule de thème (demande utilisateur du 2026-09-16) ; les autres éléments du
            mockup (recherche, action rapide) restent hors périmètre tant qu'ils n'ont pas
            d'action concrète derrière eux. Bouton menu (ajouté le 2026-09-22, compatibilité
            mobile) : visible uniquement sous 1024px (`lg:hidden`, la sidebar desktop prend le
            relais au-delà, voir Sidebar.tsx `hidden lg:flex`) — d'où justify-between plutôt que
            l'ancien justify-end, pour lui laisser sa place à gauche. Icône CID (ajoutée le
            2026-09-26, plan "Öffentliche mycid.org-Startseite" section A) : "/" redirige déjà
            vers /dashboard pour un membre actif (voir HomeRoute.tsx), donc un simple lien
            suffit — pas de cas particulier à gérer ici. */}
        <header className="glass-bar relative z-30 flex items-center justify-between gap-2 border-b border-text-tertiary/10 bg-bg-primary px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTiroirMobileOuvert(true)}
              aria-label={t("action.ouvrir_menu")}
              className="rounded-cid p-1.5 text-text-secondary transition hover:bg-bg-tertiary hover:text-text-primary lg:hidden"
            >
              <IconMenu2 size={20} />
            </button>
            {/* Logo d'en-tête retiré (demande utilisateur du 2026-10-06, point 8) : seul le logo
                de la Sidebar reste, et ramène à la Startseite (point 9). */}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            <HelpButton />
            <LanguageSwitcher />
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="contenu" tabIndex={-1} className="flex-1 overflow-y-auto p-3 outline-none sm:p-6">
          {afficherFooter ? (
            // Footer am Ende des Inhalts statt als feste Leiste (Wunsch 2026-10-31) : er nimmt
            // keinen festen Platz mehr weg und steht erst, wenn man bis ganz nach unten scrollt.
            // min-h-full hält ihn auch bei kurzen Seiten am unteren Rand ; die negativen Ränder
            // heben das Innenpolster von <main> für die Leiste auf.
            <div className="flex min-h-full flex-col">
              <div className="flex-1">
                <Outlet />
              </div>
              <div className="-mx-3 -mb-3 mt-6 sm:-mx-6 sm:-mb-6">
                <PublicFooter compact />
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      <HelpPanel />
    </div>
  );
}
