/**
 * Navigation mobile (<1024px, `lg:hidden`) — retour utilisateur du 2026-09-22 : "Die App werden
 * wir auch für Mobile kompatibel machen", dans la foulée de la refonte de la sidebar desktop
 * (voir Sidebar.tsx). Sous 1024px, l'aside persistante de Sidebar.tsx est masquée (`hidden
 * lg:flex`) car elle prendrait une largeur disproportionnée sur un écran de téléphone — ce
 * composant la remplace par le schéma mobile standard : un bouton menu (hamburger) dans le
 * bandeau du haut (voir AppLayout) ouvre un tiroir plein écran, fermé par défaut.
 *
 * Réutilise `useSidebarNav`/`NavAccordionList` de Sidebar.tsx (même calcul d'item actif, de
 * points d'activité et de groupement par rôle) plutôt que de le dupliquer — seule la coquille
 * (fond plein écran + tiroir glissant + bouton fermer) est propre à ce composant. L'état
 * ouvert/fermé est délibérément un simple state local de AppLayout (passé en props), jamais
 * persisté dans uiStore : contrairement au repli de la sidebar desktop (une vraie préférence),
 * un tiroir mobile doit toujours redémarrer fermé au chargement d'une page.
 */
import { IconLogout, IconX } from "@tabler/icons-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/authStore";
import BrandLogo from "../ui/BrandLogo";
import { NavAccordionList, useSidebarNav } from "./Sidebar";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { groups, isItemActive, itemALeSignal, handleClicItem } = useSidebarNav();

  function handleLogout() {
    // Même geste que Sidebar.handleLogout (desktop) : vide aussi le cache React Query (voir
    // authStore.logout) pour ne rien laisser fuiter au prochain compte connecté dans le même
    // navigateur. Retour utilisateur du 2026-09-28 : atterrir sur la Startseite publique plutôt
    // que directement sur /login.
    logout();
    onClose();
    navigate("/", { replace: true });
  }

  // Ferme sur Échap — même geste que le flyout desktop (RailGroupButton), pour une navigation
  // clavier cohérente entre les deux formats.
  useEffect(() => {
    if (!open) return undefined;
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [open, onClose]);

  if (!open) return null;

  function naviguer(item: Parameters<typeof handleClicItem>[0]) {
    handleClicItem(item);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      {/* Arrière-plan — clic pour fermer, même geste que les autres modales de l'app
          (ex. RapportModal) : clic uniquement sur la zone assombrie elle-même, jamais un clic
          qui a "traversé" depuis le panneau du tiroir. */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("action.ouvrir_menu")}
        className="relative flex h-full w-72 max-w-[80vw] flex-col overflow-hidden bg-sb text-white/90 shadow-xl"
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <BrandLogo className="h-9 w-9" />
          <span className="flex-1 truncate text-sm font-semibold">Clubistes in DE</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.fermer_menu")}
            className="shrink-0 rounded-cid p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <IconX size={18} />
          </button>
        </div>
        <nav className="thin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
          <NavAccordionList
            groups={groups}
            isItemActive={isItemActive}
            itemALeSignal={itemALeSignal}
            onNavigate={naviguer}
          />
        </nav>
        {user && (
          <div className="border-t border-white/10 px-4 py-3">
            <div className="mb-2 truncate text-xs text-white/60">{user.email}</div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-cid px-2 py-1.5 text-left text-xs text-white/70 transition hover:bg-white/5"
            >
              <IconLogout size={16} className="shrink-0" />
              <span>{t("action.deconnexion")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
