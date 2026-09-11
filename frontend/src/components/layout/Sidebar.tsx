/**
 * Sidebar principale — fond sombre --sb (#1A0000), cf mockup .sidebar.
 * La liste de navigation s'enrichit au fil des phases d'implémentation.
 */
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";

import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";

interface NavItem {
  to: string;
  labelKey: string;
  minRoleLevel?: number;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard" },
  // Pas de minRoleLevel : le backend scope déjà le queryset (un membre ne
  // voit que sa propre fiche), inutile de dupliquer cette règle ici.
  { to: "/membres", labelKey: "nav.membres" },
  { to: "/mon-adhesion", labelKey: "nav.mon_adhesion" },
  { to: "/cotisation", labelKey: "nav.cotisation" },
  // Validation des inscriptions (AHM-48) — visible RH+ seulement, la route
  // elle-même est aussi gated côté App.tsx (RequireRole).
  { to: "/inscriptions", labelKey: "nav.inscriptions", minRoleLevel: ROLE_LEVELS.rh },
  // Gestion des campagnes d'adhésion (AHM-21) — Bureau Admin+ seulement,
  // même niveau que CataloguePermission côté API.
  {
    to: "/admin/campagnes-adhesion",
    labelKey: "nav.admin_adhesions",
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
];

export default function Sidebar() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  function handleLogout() {
    // logout() vide aussi le cache React Query (cf queryClient.ts) — sans
    // quoi les données du compte qui se déconnecte resteraient visibles au
    // prochain compte connecté dans le même onglet.
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-sb text-white/90">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-cid bg-ca text-sm font-bold">
          CID
        </div>
        <span className="text-sm font-semibold">Clubistes in DE</span>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.filter((item) => hasRoleAtLeast(user, item.minRoleLevel ?? 1)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block rounded-cid px-3 py-2 text-sm transition ${
                isActive ? "bg-ca font-semibold text-white" : "text-white/70 hover:bg-white/5"
              }`
            }
          >
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
      {user && (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="mb-2 truncate text-xs text-white/60">{user.email}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-cid px-2 py-1.5 text-left text-xs text-white/70 transition hover:bg-white/5"
          >
            {t("action.deconnexion")}
          </button>
        </div>
      )}
    </aside>
  );
}
