/**
 * Sidebar principale — fond sombre --sb (#1A0000), cf mockup .sidebar.
 * La liste de navigation s'enrichit au fil des phases d'implémentation.
 *
 * Repliable ("Die Sidebar muss einklappbar sein") : repliée, elle se réduit à un rail étroit qui
 * n'affiche plus que les icônes (une par module, cf NAV_ITEMS.icon) — chaque item reste donc
 * cliquable et identifiable même sans libellé, avec le nom du module en `title` (tooltip natif)
 * pour compenser le texte masqué. Les icônes viennent de @tabler/icons-react, la même famille
 * que le mockup HTML de référence (webfont Tabler via CDN, ex. `ti ti-shopping-bag`), afin de
 * rester visuellement cohérent avec lui sans dépendre d'un CDN externe dans l'app React. La
 * préférence de repli est persistée (voir uiStore) et survit donc à un rechargement de page.
 */
import {
  IconBellRinging,
  IconBroadcast,
  IconBuildingStore,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCar,
  IconChartArea,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconClockDollar,
  IconCreditCard,
  IconFileCheck,
  IconGavel,
  IconHelpCircle,
  IconIdBadge,
  IconIdBadge2,
  IconLayoutDashboard,
  IconLogout,
  IconMail,
  IconMessageCircle2,
  IconNews,
  IconPhoto,
  IconSettings,
  IconShoppingBag,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";

import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";

type NavIcon = ComponentType<{ size?: number | string; className?: string }>;

interface NavItem {
  to: string;
  labelKey: string;
  icon: NavIcon;
  minRoleLevel?: number;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: IconLayoutDashboard },
  // Pas de minRoleLevel : le backend scope déjà le queryset (un membre ne
  // voit que sa propre fiche), inutile de dupliquer cette règle ici.
  { to: "/membres", labelKey: "nav.membres", icon: IconUsers },
  { to: "/mon-adhesion", labelKey: "nav.mon_adhesion", icon: IconIdBadge },
  { to: "/cotisation", labelKey: "nav.cotisation", icon: IconCreditCard },
  // Événements + Covoiturage (mockup #pg-evenements/#pg-covoiturage, FDD §3.4) — ouverts à tout
  // authentifié, même principe que /mon-adhesion : le backend scope déjà le queryset (événements
  // publiés uniquement en dessous de Bureau Admin, voir EvenementViewSet.get_queryset).
  { to: "/evenements", labelKey: "nav.evenements", icon: IconCalendarEvent },
  { to: "/covoiturage", labelKey: "nav.covoiturage", icon: IconCar },
  // Catalogue boutique (mockup #pg-boutique) — ouvert à tout authentifié, même principe que
  // /mon-adhesion : le backend scope déjà le queryset (produits publiés uniquement en dessous
  // de Bureau Admin, voir ProduitViewSet.get_queryset).
  { to: "/boutique", labelKey: "nav.boutique", icon: IconShoppingBag },
  // Votes & Élections (mockup #pg-vote, FDD §3.5/F-008) — ouvert à tout authentifié, même
  // principe que /mon-adhesion et /boutique : le backend scope déjà la visibilité (résultats
  // masqués tant que non clôturé, voir VoteSessionViewSet.resultats) ; la création/clôture de
  // session reste gérée par la page elle-même pour l'exception Dir. Financier (voir VotePage).
  { to: "/votes", labelKey: "nav.votes", icon: IconGavel },
  // Fil d'actualité + Forum (mockup #pg-fil/#pg-forum, Release Plan §3.2, Phase 4A) — ouverts à
  // tout authentifié, même principe que /votes : le backend scope déjà la visibilité (voir
  // PublicationViewSet/SujetViewSet.get_queryset).
  { to: "/fil", labelKey: "nav.fil", icon: IconNews },
  { to: "/forum", labelKey: "nav.forum", icon: IconMessageCircle2 },
  // Messagerie privée + Groupes de chat (mockup #pg-messagerie/#pg-groupes, Release Plan
  // §3.2, Phase 4A/4B) — ouverts à tout authentifié, même principe que /fil et /forum.
  { to: "/messagerie", labelKey: "nav.messagerie", icon: IconMail },
  { to: "/groupes", labelKey: "nav.groupes", icon: IconUsersGroup },
  // Live Match, Albums photos, Quiz (mockup #pg-live/#pg-albums/#pg-quiz, Release Plan §3.2,
  // troisième lot Phase 4B) — ouverts à tout authentifié, même principe que /fil et /groupes.
  { to: "/live", labelKey: "nav.live", icon: IconBroadcast },
  { to: "/albums", labelKey: "nav.albums", icon: IconPhoto },
  { to: "/quiz", labelKey: "nav.quiz", icon: IconHelpCircle },
  // Gestion des quiz (mockup #pg-quiz) — Bureau Admin+ seulement, même niveau que
  // GestionQuizPermission côté API.
  {
    to: "/admin/quiz",
    labelKey: "nav.admin_quiz",
    icon: IconSettings,
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Gestion boutique (mockup #pg-admin-boutique) — Bureau Admin+ seulement, même niveau que
  // CatalogueBoutiquePermission/ORDER_VISIBILITY_MIN_LEVEL côté API.
  {
    to: "/admin/boutique",
    labelKey: "nav.admin_boutique",
    icon: IconBuildingStore,
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Gestion des événements (mockup #pg-admin-events) — Bureau Admin+ seulement, même niveau que
  // EvenementPermission (EVENEMENT_WRITE_ACTIONS) côté API.
  {
    to: "/admin/events",
    labelKey: "nav.admin_events",
    icon: IconCalendarPlus,
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Statistiques & KPIs (mockup #pg-stats, FDD §5.3) — Admin/DG/Bureau Admin seulement, même
  // niveau que StatsPermission côté API.
  {
    to: "/stats",
    labelKey: "nav.stats",
    icon: IconChartArea,
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Validation des inscriptions (AHM-48) — visible RH+ seulement, la route
  // elle-même est aussi gated côté App.tsx (RequireRole).
  {
    to: "/inscriptions",
    labelKey: "nav.inscriptions",
    icon: IconClipboardCheck,
    minRoleLevel: ROLE_LEVELS.rh,
  },
  // File de validation des justificatifs de rabais (AHM-20) — RH+ seulement, même niveau que
  // JustificatifPermission.RH_ONLY_ACTIONS côté API.
  {
    to: "/admin/justificatifs",
    labelKey: "nav.admin_justificatifs",
    icon: IconFileCheck,
    minRoleLevel: ROLE_LEVELS.rh,
  },
  // Gestion des campagnes d'adhésion (AHM-21) — Bureau Admin+ seulement,
  // même niveau que CataloguePermission côté API.
  {
    to: "/admin/campagnes-adhesion",
    labelKey: "nav.admin_adhesions",
    icon: IconIdBadge2,
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Confirmation manuelle des paiements en attente (AHM-53) — Directeur Financier/Admin
  // seulement, même niveau que marquer_payee côté API.
  {
    to: "/cotisations/en-attente",
    labelKey: "nav.cotisations_en_attente",
    icon: IconClockDollar,
    minRoleLevel: ROLE_LEVELS.dir_financier,
  },
  // Échéances des relances par année (AHM-54) — Directeur Financier/Admin seulement, même
  // niveau que ConfigurationRelancePermission côté API.
  {
    to: "/cotisations/relances",
    labelKey: "nav.configuration_relance",
    icon: IconBellRinging,
    minRoleLevel: ROLE_LEVELS.dir_financier,
  },
];

export default function Sidebar() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();

  function handleLogout() {
    // logout() vide aussi le cache React Query (cf queryClient.ts) — sans
    // quoi les données du compte qui se déconnecte resteraient visibles au
    // prochain compte connecté dans le même onglet.
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside
      className={`flex h-screen flex-col overflow-hidden bg-sb text-white/90 transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-5">
        {!collapsed && (
          <>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cid bg-ca text-sm font-bold">
              CID
            </div>
            <span className="flex-1 truncate text-sm font-semibold">Clubistes in DE</span>
          </>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t(collapsed ? "action.deplier_sidebar" : "action.replier_sidebar")}
          className={`shrink-0 rounded-cid p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white ${
            collapsed ? "mx-auto" : ""
          }`}
        >
          {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
        </button>
      </div>
      {/* overflow-y-auto + min-h-0 : le nombre de modules a fini par dépasser la hauteur de
          l'écran (bug remonté en test manuel — la sidebar sombre s'arrêtait avant la fin des
          items, qui continuaient sur le fond clair de la page). Sans min-h-0, un enfant flex-1
          ne se contracte jamais en dessous de son contenu, donc le overflow-y-auto n'avait
          aucun effet (l'aside h-screen débordait silencieusement). Repliée, chaque item garde
          son icône (voir docstring du composant) — seul le libellé texte est masqué, avec un
          `title` natif en repli pour rester identifiable. */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
        {NAV_ITEMS.filter((item) => hasRoleAtLeast(user, item.minRoleLevel ?? 1)).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? t(item.labelKey) : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-cid px-3 py-2 text-sm transition ${
                  collapsed ? "justify-center px-0" : ""
                } ${isActive ? "bg-ca font-semibold text-white" : "text-white/70 hover:bg-white/5"}`
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </NavLink>
          );
        })}
      </nav>
      {user && (
        <div className={`border-t border-white/10 py-3 ${collapsed ? "px-2" : "px-4"}`}>
          {!collapsed && <div className="mb-2 truncate text-xs text-white/60">{user.email}</div>}
          <button
            type="button"
            onClick={handleLogout}
            aria-label={t("action.deconnexion")}
            title={collapsed ? t("action.deconnexion") : undefined}
            className={`flex w-full items-center gap-2 rounded-cid px-2 py-1.5 text-xs text-white/70 transition hover:bg-white/5 ${
              collapsed ? "justify-center" : "text-left"
            }`}
          >
            <IconLogout size={16} className="shrink-0" />
            {!collapsed && <span>{t("action.deconnexion")}</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
