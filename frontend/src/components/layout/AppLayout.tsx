import { Outlet } from "react-router-dom";

import LanguageSwitcher from "./LanguageSwitcher";
import NotificationBell from "./NotificationBell";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar (mockup .topbar) — cloche de notifications (Phase 2B), sélecteur de langue et
            bascule de thème (demande utilisateur du 2026-09-16) ; les autres éléments du
            mockup (recherche, action rapide) restent hors périmètre tant qu'ils n'ont pas
            d'action concrète derrière eux. */}
        <header className="flex items-center justify-end gap-2 border-b border-text-tertiary/10 bg-bg-primary px-6 py-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto bg-bg-tertiary p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
