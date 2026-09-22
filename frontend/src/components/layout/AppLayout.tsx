import { IconMenu2 } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";

import LanguageSwitcher from "./LanguageSwitcher";
import MobileNavDrawer from "./MobileNavDrawer";
import NotificationBell from "./NotificationBell";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";

export default function AppLayout() {
  const { t } = useTranslation("common");
  // État purement local (jamais dans uiStore, voir docstring MobileNavDrawer) : un tiroir doit
  // toujours redémarrer fermé, contrairement au repli de la sidebar desktop qui est une vraie
  // préférence persistée.
  const [tiroirMobileOuvert, setTiroirMobileOuvert] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileNavDrawer open={tiroirMobileOuvert} onClose={() => setTiroirMobileOuvert(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar (mockup .topbar) — cloche de notifications (Phase 2B), sélecteur de langue et
            bascule de thème (demande utilisateur du 2026-09-16) ; les autres éléments du
            mockup (recherche, action rapide) restent hors périmètre tant qu'ils n'ont pas
            d'action concrète derrière eux. Bouton menu (ajouté le 2026-09-22, compatibilité
            mobile) : visible uniquement sous 1024px (`lg:hidden`, la sidebar desktop prend le
            relais au-delà, voir Sidebar.tsx `hidden lg:flex`) — d'où justify-between plutôt que
            l'ancien justify-end, pour lui laisser sa place à gauche. */}
        <header className="flex items-center justify-between gap-2 border-b border-text-tertiary/10 bg-bg-primary px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => setTiroirMobileOuvert(true)}
            aria-label={t("action.ouvrir_menu")}
            className="rounded-cid p-1.5 text-text-secondary transition hover:bg-bg-tertiary hover:text-text-primary lg:hidden"
          >
            <IconMenu2 size={20} />
          </button>
          <div className="flex flex-1 items-center justify-end gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-bg-tertiary p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
