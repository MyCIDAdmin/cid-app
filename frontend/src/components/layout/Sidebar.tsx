/**
 * Sidebar principale — fond sombre --sb (#1A0000), cf mockup .sidebar.
 * La liste de navigation s'enrichit au fil des phases d'implémentation.
 */
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { hasRoleAtLeast, useAuthStore } from "../../store/authStore";

interface NavItem {
  to: string;
  labelKey: string;
  minRoleLevel?: number;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard" },
  { to: "/mon-adhesion", labelKey: "nav.mon_adhesion" },
  { to: "/cotisation", labelKey: "nav.cotisation" },
];

export default function Sidebar() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);

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
        <div className="border-t border-white/10 px-4 py-3 text-xs text-white/60">
          {user.email}
        </div>
      )}
    </aside>
  );
}
