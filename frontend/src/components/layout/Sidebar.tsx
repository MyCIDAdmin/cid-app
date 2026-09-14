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
 *
 * Groupes en accordéon ("Kann man die Module clustern ?", pour se passer du défilement) : le
 * mockup de référence organise déjà sa nav en groupes nommés (sbg/sbl : Général, Communauté,
 * Contenu, Administration...) plutôt qu'en une seule liste plate — NAV_ITEMS reprend ce
 * découpage (adapté aux modules réellement construits) via son champ `group`. Dépliée, la
 * sidebar affiche donc des en-têtes de groupe cliquables ; repliés, ils masquent leurs items et
 * réduisent d'autant la hauteur nécessaire (voir uiStore.collapsedGroups pour les valeurs par
 * défaut, notamment "Administration" replié d'entrée).
 *
 * Le clic sur l'en-tête est la seule source de vérité pour replier/déplier un groupe (bug
 * corrigé : une première version forçait aussi le dépli du groupe contenant la page active, ce
 * qui rendait "Général" impossible à replier en pratique — il contient le tableau de bord, donc
 * quasiment toujours actif). Un groupe replié qui contient quand même la page active se contente
 * d'un en-tête mis en évidence (texte plus clair), sans forcer l'ouverture — la préférence de
 * l'utilisateur passe toujours avant. En mode rail (sidebar entière repliée), les groupes n'ont
 * plus de sens (pas de place pour un en-tête) : tous les items s'affichent alors à plat.
 */
import {
  IconBellRinging,
  IconBroadcast,
  IconBuildingStore,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCar,
  IconChartArea,
  IconChevronDown,
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
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { type SidebarGroupKey, useUiStore } from "../../store/uiStore";
import BrandLogo from "../ui/BrandLogo";

type NavIcon = ComponentType<{ size?: number | string; className?: string }>;

interface NavItem {
  to: string;
  labelKey: string;
  icon: NavIcon;
  group: SidebarGroupKey;
  minRoleLevel?: number;
}

// Ordre d'affichage des groupes + libellé i18n de leur en-tête (nav_groupe.* dans common.json).
const GROUP_ORDER: SidebarGroupKey[] = ["general", "communaute", "contenu", "administration"];
const GROUP_LABEL_KEYS: Record<SidebarGroupKey, string> = {
  general: "nav_groupe.general",
  communaute: "nav_groupe.communaute",
  contenu: "nav_groupe.contenu",
  administration: "nav_groupe.administration",
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: IconLayoutDashboard, group: "general" },
  // Pas de minRoleLevel : le backend scope déjà le queryset (un membre ne
  // voit que sa propre fiche), inutile de dupliquer cette règle ici.
  { to: "/membres", labelKey: "nav.membres", icon: IconUsers, group: "general" },
  { to: "/mon-adhesion", labelKey: "nav.mon_adhesion", icon: IconIdBadge, group: "general" },
  { to: "/cotisation", labelKey: "nav.cotisation", icon: IconCreditCard, group: "general" },
  // Événements + Covoiturage (mockup #pg-evenements/#pg-covoiturage, FDD §3.4) — ouverts à tout
  // authentifié, même principe que /mon-adhesion : le backend scope déjà le queryset (événements
  // publiés uniquement en dessous de Bureau Admin, voir EvenementViewSet.get_queryset).
  { to: "/evenements", labelKey: "nav.evenements", icon: IconCalendarEvent, group: "general" },
  { to: "/covoiturage", labelKey: "nav.covoiturage", icon: IconCar, group: "general" },
  // Catalogue boutique (mockup #pg-boutique) — ouvert à tout authentifié, même principe que
  // /mon-adhesion : le backend scope déjà le queryset (produits publiés uniquement en dessous
  // de Bureau Admin, voir ProduitViewSet.get_queryset).
  { to: "/boutique", labelKey: "nav.boutique", icon: IconShoppingBag, group: "general" },
  // Fil d'actualité + Forum (mockup #pg-fil/#pg-forum, Release Plan §3.2, Phase 4A) — ouverts à
  // tout authentifié, même principe que /mon-adhesion : le backend scope déjà la visibilité (voir
  // PublicationViewSet/SujetViewSet.get_queryset).
  { to: "/fil", labelKey: "nav.fil", icon: IconNews, group: "communaute" },
  { to: "/forum", labelKey: "nav.forum", icon: IconMessageCircle2, group: "communaute" },
  // Messagerie privée + Groupes de chat (mockup #pg-messagerie/#pg-groupes, Release Plan
  // §3.2, Phase 4A/4B) — ouverts à tout authentifié, même principe que /fil et /forum.
  { to: "/messagerie", labelKey: "nav.messagerie", icon: IconMail, group: "communaute" },
  { to: "/groupes", labelKey: "nav.groupes", icon: IconUsersGroup, group: "communaute" },
  // Live Match (mockup #pg-live, Release Plan §3.2, troisième lot Phase 4B) — ouvert à tout
  // authentifié, même principe que /fil et /groupes.
  { to: "/live", labelKey: "nav.live", icon: IconBroadcast, group: "communaute" },
  // Albums photos, Quiz (mockup #pg-albums/#pg-quiz) + Votes & Élections (mockup #pg-vote, FDD
  // §3.5/F-008) — ouverts à tout authentifié : le backend scope déjà la visibilité (résultats de
  // vote masqués tant que non clôturé, voir VoteSessionViewSet.resultats ; la création/clôture de
  // session reste gérée par la page elle-même pour l'exception Dir. Financier, voir VotePage).
  { to: "/albums", labelKey: "nav.albums", icon: IconPhoto, group: "contenu" },
  { to: "/quiz", labelKey: "nav.quiz", icon: IconHelpCircle, group: "contenu" },
  { to: "/votes", labelKey: "nav.votes", icon: IconGavel, group: "contenu" },
  // Gestion des quiz (mockup #pg-quiz) — Bureau Admin+ seulement, même niveau que
  // GestionQuizPermission côté API.
  {
    to: "/admin/quiz",
    labelKey: "nav.admin_quiz",
    icon: IconSettings,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Gestion boutique (mockup #pg-admin-boutique) — Bureau Admin+ seulement, même niveau que
  // CatalogueBoutiquePermission/ORDER_VISIBILITY_MIN_LEVEL côté API.
  {
    to: "/admin/boutique",
    labelKey: "nav.admin_boutique",
    icon: IconBuildingStore,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Gestion des événements (mockup #pg-admin-events) — Bureau Admin+ seulement, même niveau que
  // EvenementPermission (EVENEMENT_WRITE_ACTIONS) côté API.
  {
    to: "/admin/events",
    labelKey: "nav.admin_events",
    icon: IconCalendarPlus,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Statistiques & KPIs (mockup #pg-stats, FDD §5.3) — Admin/DG/Bureau Admin seulement, même
  // niveau que StatsPermission côté API.
  {
    to: "/stats",
    labelKey: "nav.stats",
    icon: IconChartArea,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Validation des inscriptions (AHM-48) — visible RH+ seulement, la route
  // elle-même est aussi gated côté App.tsx (RequireRole).
  {
    to: "/inscriptions",
    labelKey: "nav.inscriptions",
    icon: IconClipboardCheck,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.rh,
  },
  // File de validation des justificatifs de rabais (AHM-20) — RH+ seulement, même niveau que
  // JustificatifPermission.RH_ONLY_ACTIONS côté API.
  {
    to: "/admin/justificatifs",
    labelKey: "nav.admin_justificatifs",
    icon: IconFileCheck,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.rh,
  },
  // Gestion des campagnes d'adhésion (AHM-21) — Bureau Admin+ seulement,
  // même niveau que CataloguePermission côté API.
  {
    to: "/admin/campagnes-adhesion",
    labelKey: "nav.admin_adhesions",
    icon: IconIdBadge2,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.bureau_admin,
  },
  // Confirmation manuelle des paiements en attente (AHM-53) — Directeur Financier/Admin
  // seulement, même niveau que marquer_payee côté API.
  {
    to: "/cotisations/en-attente",
    labelKey: "nav.cotisations_en_attente",
    icon: IconClockDollar,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.dir_financier,
  },
  // Échéances des relances par année (AHM-54) — Directeur Financier/Admin seulement, même
  // niveau que ConfigurationRelancePermission côté API.
  {
    to: "/cotisations/relances",
    labelKey: "nav.configuration_relance",
    icon: IconBellRinging,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.dir_financier,
  },
];

export default function Sidebar() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const collapsedGroups = useUiStore((s) => s.collapsedGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    // logout() vide aussi le cache React Query (cf queryClient.ts) — sans
    // quoi les données du compte qui se déconnecte resteraient visibles au
    // prochain compte connecté dans le même onglet.
    logout();
    navigate("/login", { replace: true });
  }

  const visibleItems = NAV_ITEMS.filter((item) => hasRoleAtLeast(user, item.minRoleLevel ?? 1));

  function isItemActive(item: NavItem): boolean {
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  }

  // Groupes non vides, dans l'ordre fixe GROUP_ORDER, chacun sachant s'il contient la page
  // active — sert uniquement à mettre l'en-tête en évidence, jamais à forcer le dépli (voir
  // docstring : la préférence de repli de l'utilisateur reste toujours prioritaire).
  const groups = GROUP_ORDER.map((key) => {
    const items = visibleItems.filter((item) => item.group === key);
    return { key, items, hasActiveItem: items.some(isItemActive) };
  }).filter((group) => group.items.length > 0);

  function renderItem(item: NavItem) {
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
            <BrandLogo className="h-9 w-9" />
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
          aucun effet (l'aside h-screen débordait silencieusement). Le groupement en accordéon
          (voir docstring) réduit maintenant la hauteur nécessaire en amont ; ce défilement reste
          le filet de sécurité si un groupe entièrement déplié dépasse quand même l'écran. */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
        {collapsed
          ? // Rail étroit : pas de place pour un en-tête de groupe, tout à plat (voir docstring).
            visibleItems.map(renderItem)
          : groups.map((group) => {
              const expanded = !collapsedGroups[group.key];
              return (
                <div key={group.key} className="pt-1 first:pt-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className={`flex w-full items-center justify-between rounded-cid px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition hover:text-white/70 ${
                      // Repliée mais contenant la page active : en-tête mis en évidence plutôt
                      // que forcer l'ouverture (voir docstring) — reste un simple repère visuel.
                      group.hasActiveItem ? "text-white/70" : "text-white/40"
                    }`}
                  >
                    <span className="truncate">{t(GROUP_LABEL_KEYS[group.key])}</span>
                    <IconChevronDown
                      size={14}
                      className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                    />
                  </button>
                  {expanded && <div className="space-y-1">{group.items.map(renderItem)}</div>}
                </div>
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
