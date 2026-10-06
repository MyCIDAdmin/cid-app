/**
 * Menu utilisateur (topbar, à côté de NotificationBell) — ajouté le 2026-09-28, retour
 * utilisateur : "Neben der Glocke für Benachrichtingungen ein Button für den Menü für den User
 * Profil hinzufügen". Regroupe l'accès au profil personnel (/mon-profil, voir MembreFormPage.tsx
 * mode profil), les préférences d'affichage (thème, langue — réutilise ThemeToggle/
 * LanguageSwitcher tels quels plutôt que de dupliquer leur logique) et la déconnexion, déplacée
 * ici depuis le bas de la Sidebar/MobileNavDrawer (retour utilisateur, point 2.3 : "Der Button
 * für die Abmeldung soll auch unter dem User Profil umgezogen werden").
 *
 * Dropdown simple en `absolute` (pas de portail) — même principe que NotificationBell.tsx, dans
 * le même conteneur topbar (jamais `overflow-hidden`), contrairement au rail replié de la
 * Sidebar qui a lui besoin d'un portail (RailGroupButton) pour survivre à son ancêtre en
 * overflow.
 */
import { IconLogout, IconSettings, IconUserCircle } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";

function initiales(user: { prenom?: string; nom?: string; email: string }): string {
  if (user.prenom && user.nom) {
    return `${user.prenom.charAt(0)}${user.nom.charAt(0)}`.toUpperCase();
  }
  return user.email.charAt(0).toUpperCase();
}

export default function UserMenu() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [ouvert, setOuvert] = useState(false);
  const panneauRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickExterieur(e: MouseEvent) {
      if (panneauRef.current && !panneauRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    if (ouvert) document.addEventListener("mousedown", handleClickExterieur);
    return () => document.removeEventListener("mousedown", handleClickExterieur);
  }, [ouvert]);

  if (!user) return null;

  function handleLogout() {
    // Même geste que Sidebar.handleLogout/MobileNavDrawer.handleLogout (vide le cache React
    // Query, atterrit sur la Startseite publique) — la déconnexion elle-même a déménagé ici
    // (retour utilisateur du 2026-09-28) : ces deux endroits ne l'affichent plus.
    logout();
    setOuvert(false);
    navigate("/", { replace: true });
  }

  const nomAffiche = user.prenom && user.nom ? `${user.prenom} ${user.nom}` : user.email;

  return (
    <div ref={panneauRef} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label={t("menu_utilisateur.aria_label")}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-cal text-xs font-semibold text-ca hover:opacity-80"
      >
        {initiales(user)}
      </button>

      {ouvert && (
        <div
          role="menu"
          aria-label={t("menu_utilisateur.aria_label")}
          className="absolute right-0 z-20 mt-2 w-64 rounded-cid-lg bg-bg-primary py-2 shadow-xl"
        >
          <div className="border-b border-text-tertiary/20 px-3 pb-2">
            <p className="truncate text-sm font-semibold text-text-primary">{nomAffiche}</p>
            <p className="truncate text-xs text-text-tertiary">{user.email}</p>
          </div>
          <Link
            to="/mon-profil"
            onClick={() => setOuvert(false)}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            <IconUserCircle size={16} className="shrink-0" />
            {t("menu_utilisateur.mon_profil")}
          </Link>
          <Link
            to="/mon-profil?onglet=einstellungen"
            onClick={() => setOuvert(false)}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            <IconSettings size={16} className="shrink-0" />
            {t("menu_utilisateur.einstellungen")}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            role="menuitem"
            className="flex w-full items-center gap-2 border-t border-text-tertiary/20 px-3 pt-2 text-left text-sm text-status-dangerText hover:bg-bg-tertiary"
          >
            <IconLogout size={16} className="shrink-0" />
            {t("action.deconnexion")}
          </button>
        </div>
      )}
    </div>
  );
}
