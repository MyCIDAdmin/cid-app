/**
 * Sidebar principale (desktop, ≥1024px — `hidden lg:flex`, voir `MobileNavDrawer.tsx` pour
 * l'équivalent mobile) — fond sombre --sb (#1A0000), cf mockup .sidebar. La liste de navigation
 * s'enrichit au fil des phases d'implémentation.
 *
 * Refonte du 2026-09-22 (retour utilisateur : "Die Sidebar mit der Scrollbar stört mich. Ich
 * möchte eine modernere Darstellung als Menü-Button und/oder Tabs") : le nombre de modules a fini
 * par dépasser la hauteur de l'écran même en mode rail (27 items pour un super_admin, ~40px
 * chacun ≈ 1150px, largement au-delà d'un viewport desktop courant), d'où la scrollbar native
 * disgracieuse remontée par l'utilisateur. Le mode rail (repliée) n'affiche donc plus les items
 * à plat mais un icône PAR GROUPE (GROUP_ICONS) : cliquer sur un groupe ouvre un flyout listant
 * ses items, comme la barre d'activité de VS Code ou la sidebar de Slack — 4 groupes tiennent
 * toujours en hauteur sans défilement, quel que soit le rôle. Le mode déplié (accordéon par
 * groupe, historique) reste inchangé et accessible via le même bouton de bascule qu'avant.
 *
 * Repliable ("Die Sidebar muss einklappbar sein") : la préférence de repli est persistée (voir
 * uiStore, désormais repliée par défaut) et survit donc à un rechargement de page.
 *
 * Groupes ("Kann man die Module clustern ?", pour se passer du défilement) : le mockup de
 * référence organise déjà sa nav en groupes nommés (sbg/sbl : Général, Communauté, Contenu,
 * Administration...) plutôt qu'en une seule liste plate — NAV_ITEMS reprend ce découpage (adapté
 * aux modules réellement construits) via son champ `group`. Dépliée, la sidebar affiche des
 * en-têtes de groupe cliquables (accordéon) ; repliée, chaque groupe devient un bouton-icône
 * ouvrant son flyout (voir plus haut).
 *
 * Un seul item actif à la fois, même quand deux `to` sont préfixes l'un de l'autre (bug corrigé
 * le 2026-09-21, retour utilisateur : "Wenn ich auf Shop dann auf Meine Bestellungen klicke,
 * bleiben beide highlighted"). `useSidebarNav` (exporté pour `MobileNavDrawer.tsx`, qui a besoin
 * exactement de la même logique plutôt que de la dupliquer) calcule donc, pour tout le menu, LE
 * seul item dont le `to` correspond ET qui est le plus spécifique (le plus long) — remplace le
 * calcul d'activité intégré de <NavLink> par un simple <Link> + comparaison directe.
 *
 * "Mes commandes"/"Mes bons d'achat" repliées dans Boutique (demande utilisateur du 2026-09-23 :
 * "'Meine Bestellungen' und 'Meine Gutscheine' in die Boutique verschieben") : ces deux entrées,
 * ajoutées respectivement le 2026-09-19 et le 2026-09-23 avec leurs propres routes/items, ont été
 * retirées de NAV_ITEMS — elles vivent désormais comme onglets de BoutiquePage (`/boutique?
 * onglet=commandes`/`?onglet=bons_achat`, voir App.tsx), le bug de double-highlight décrit
 * ci-dessus n'a donc plus lieu d'être pour "/boutique" (plus de sous-route partageant son
 * préfixe avec un item dédié).
 *
 * Le clic sur l'en-tête est la seule source de vérité pour replier/déplier un groupe en mode
 * déplié (bug corrigé : une première version forçait aussi le dépli du groupe contenant la page
 * active, ce qui rendait "Général" impossible à replier en pratique — il contient le tableau de
 * bord, donc quasiment toujours actif). Un groupe replié qui contient quand même la page active
 * se contente d'un en-tête mis en évidence (texte plus clair), sans forcer l'ouverture — la
 * préférence de l'utilisateur passe toujours avant.
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
  IconFolderCog,
  IconGavel,
  IconHelpCircle,
  IconIdBadge,
  IconIdBadge2,
  IconLayoutDashboard,
  IconLogout,
  IconMail,
  IconMailCog,
  IconMessageCircle2,
  IconNews,
  IconPhoto,
  IconPhotoEdit,
  IconSettings,
  IconShoppingBag,
  IconTag,
  IconTargetArrow,
  IconUserCog,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useMarquerLuesPrefixe, useNotificationsNonLues } from "../../hooks/useNotifications";
import { useMesAcces } from "../../hooks/useRbac";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { type SidebarGroupKey, useUiStore } from "../../store/uiStore";
import { pageEstAccessible } from "../../types/rbac";
import BrandLogo from "../ui/BrandLogo";

export type NavIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface NavItem {
  to: string;
  labelKey: string;
  icon: NavIcon;
  group: SidebarGroupKey;
  /** Mutuellement exclusif avec `pageSlug` (même principe que RequireRole, voir
   * components/RequireRole.tsx) — un item réservé à un rôle système fixe, jamais piloté par la
   * matrice (ex. "/admin/roles", volontairement hors matrice). */
  minRoleLevel?: number;
  /** Phase D (ajoutée le 2026-09-23) : visibilité pilotée par la matrice apps.rbac
   * (`has_admin_page_access`, voir hooks/useRbac.ts::useMesAcces) plutôt que par un seuil
   * `minRoleLevel` statique — l'item disparaît/apparaît selon ce qu'un Administrateur App a
   * configuré pour le rôle courant, y compris pour un rôle système (real enforcement). */
  pageSlug?: string;
}

// Ordre d'affichage des groupes + libellé i18n de leur en-tête (nav_groupe.* dans common.json).
export const GROUP_ORDER: SidebarGroupKey[] = [
  "general",
  "communaute",
  "contenu",
  "administration",
];
export const GROUP_LABEL_KEYS: Record<SidebarGroupKey, string> = {
  general: "nav_groupe.general",
  communaute: "nav_groupe.communaute",
  contenu: "nav_groupe.contenu",
  administration: "nav_groupe.administration",
};

// Icône représentative par groupe (mode rail replié uniquement, voir docstring de module) — un
// seul bouton-icône par groupe plutôt qu'un par item, donc un choix distinct des icônes déjà
// prises par les items eux-mêmes n'est pas nécessaire (jamais affichés côte à côte).
const GROUP_ICONS: Record<SidebarGroupKey, NavIcon> = {
  general: IconLayoutDashboard,
  communaute: IconUsersGroup,
  contenu: IconPhoto,
  administration: IconSettings,
};

export const NAV_ITEMS: NavItem[] = [
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
  // Projets & Actions (module ajouté le 2026-09-22 sur demande utilisateur) — ouvert à tout
  // authentifié, même principe que /evenements : le backend ne renvoie de toute façon pas les
  // projets "en_preparation" à un rôle < Bureau Admin (voir ProjetViewSet.get_queryset).
  { to: "/projets", labelKey: "nav.projets", icon: IconTargetArrow, group: "general" },
  // Catalogue boutique (mockup #pg-boutique) — ouvert à tout authentifié, même principe que
  // /mon-adhesion : le backend scope déjà le queryset (produits publiés uniquement en dessous
  // de Bureau Admin, voir ProduitViewSet.get_queryset).
  // "Mes commandes" et "Mes bons d'achat" n'ont plus leur propre entrée depuis le 2026-09-23
  // (voir docstring de module) — accessibles comme onglets de cette même page.
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
  // Phase D (ajoutée le 2026-09-23) : ces 13 items sont désormais pilotés par la matrice
  // apps.rbac (`pageSlug`) plutôt qu'un `minRoleLevel` statique — le seuil de départ (valeur
  // seedée par la migration 0003) reste identique à l'ancien `minRoleLevel` indiqué en
  // commentaire, mais un Administrateur App peut désormais l'ouvrir/fermer par rôle système sans
  // déploiement (voir useSidebarNav ci-dessous et RequireRole/App.tsx pour le gate de route
  // correspondant). "/admin/roles" reste seul sur `minRoleLevel` (hors matrice, volontairement).
  {
    to: "/admin/quiz",
    labelKey: "nav.admin_quiz",
    icon: IconSettings,
    group: "administration",
    pageSlug: "page_quiz", // seuil de départ : Bureau Admin
  },
  {
    to: "/admin/boutique",
    labelKey: "nav.admin_boutique",
    icon: IconBuildingStore,
    group: "administration",
    pageSlug: "page_boutique", // seuil de départ : Bureau Admin
  },
  {
    to: "/admin/events",
    labelKey: "nav.admin_events",
    icon: IconCalendarPlus,
    group: "administration",
    pageSlug: "page_events", // seuil de départ : Bureau Admin
  },
  {
    to: "/stats",
    labelKey: "nav.stats",
    icon: IconChartArea,
    group: "administration",
    pageSlug: "page_stats", // seuil de départ : Bureau Admin
  },
  // La route elle-même est aussi gated côté App.tsx (RequireRole, pageSlug="page_inscriptions").
  {
    to: "/inscriptions",
    labelKey: "nav.inscriptions",
    icon: IconClipboardCheck,
    group: "administration",
    pageSlug: "page_inscriptions", // seuil de départ : RH
  },
  {
    to: "/admin/justificatifs",
    labelKey: "nav.admin_justificatifs",
    icon: IconFileCheck,
    group: "administration",
    pageSlug: "page_justificatifs", // seuil de départ : RH
  },
  {
    to: "/admin/campagnes-adhesion",
    labelKey: "nav.admin_adhesions",
    icon: IconIdBadge2,
    group: "administration",
    pageSlug: "page_campagnes_adhesion", // seuil de départ : Bureau Admin
  },
  {
    to: "/cotisations/en-attente",
    labelKey: "nav.cotisations_en_attente",
    icon: IconClockDollar,
    group: "administration",
    pageSlug: "page_cotisations_attente", // seuil de départ : Directeur Financier
  },
  {
    to: "/cotisations/relances",
    labelKey: "nav.configuration_relance",
    icon: IconBellRinging,
    group: "administration",
    pageSlug: "page_cotisations_relances", // seuil de départ : Directeur Financier
  },
  // Gestion des rôles utilisateurs (SCD §4.2/§8.1) — Admin App seulement, même niveau que
  // UsersListView/ChangeUserRoleView côté API. Volontairement HORS matrice (risque
  // d'auto-escalade, décision confirmée avec l'utilisateur) — reste sur minRoleLevel.
  {
    to: "/admin/roles",
    labelKey: "nav.gestion_roles",
    icon: IconUserCog,
    group: "administration",
    minRoleLevel: ROLE_LEVELS.super_admin,
  },
  {
    to: "/admin/articles-cotisation",
    labelKey: "nav.articles_cotisation",
    icon: IconTag,
    group: "administration",
    pageSlug: "page_articles_cotisation", // seuil de départ : Administrateur App
  },
  {
    to: "/admin/notifications",
    labelKey: "nav.parametres_notification",
    icon: IconMailCog,
    group: "administration",
    pageSlug: "page_notifications_params", // seuil de départ : Administrateur App
  },
  {
    to: "/admin/projets",
    labelKey: "nav.admin_projets",
    icon: IconFolderCog,
    group: "administration",
    pageSlug: "page_projets", // seuil de départ : Bureau Admin
  },
  {
    to: "/admin/albums",
    labelKey: "nav.admin_albums",
    icon: IconPhotoEdit,
    group: "administration",
    pageSlug: "page_albums", // seuil de départ : Bureau Admin
  },
];

export interface SidebarNavGroup {
  key: SidebarGroupKey;
  items: NavItem[];
  hasActiveItem: boolean;
}

/**
 * Logique de navigation partagée entre `Sidebar` (desktop) et `MobileNavDrawer` (mobile) — un
 * seul et même calcul d'item actif / de notifications par module / de groupement par rôle,
 * plutôt que de le dupliquer dans les deux composants (source d'incohérences garantie sinon,
 * ex. un item marqué actif sur desktop mais pas sur mobile).
 */
export function useSidebarNav() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  // Point d'activité par module (ajouté le 2026-09-16, demande utilisateur : "Für die Sidebar,
  // es soll ein zeichen ... geben, der hinweist dass es neuigkeiten bei dem Modul gibt") :
  // dérivé des notifications non lues dont `lien` commence par le `to` de l'item — même
  // comparaison de préfixe que isItemActive ci-dessous, donc jamais deux items à la fois pour
  // un même lien (ex. "/cotisations" n'allume jamais "/cotisations/en-attente"). Cloche et point
  // partagent le même état "lu" côté backend (voir hooks/useNotifications) : marquer un module
  // comme visité fait baisser le badge de la cloche avec lui, un seul état de lecture.
  const notificationsNonLues = useNotificationsNonLues().data?.results ?? [];
  const marquerLuesPrefixeMutation = useMarquerLuesPrefixe();

  // Phase D (ajoutée le 2026-09-23) : accès effectif aux 13 pages de gestion pilotées par la
  // matrice (item.pageSlug) — voir NAV_ITEMS ci-dessus et RequireRole pour l'équivalent côté
  // route. L'Administrateur App n'attend jamais cette requête (accès hartcodé, comme
  // RequireRole) ; pendant le chargement, un item `pageSlug` reste masqué plutôt que affiché
  // puis retiré au premier rendu (même logique prudente que RequireRole : jamais laisser
  // entrevoir une page finalement inaccessible).
  const estSuperAdmin = user?.role === "super_admin";
  const { data: mesAcces, isLoading: chargementAcces } = useMesAcces();

  function aAccesPage(item: NavItem): boolean {
    if (!item.pageSlug) return true;
    if (estSuperAdmin) return true;
    if (chargementAcces) return false;
    return pageEstAccessible(mesAcces?.[item.pageSlug]);
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => hasRoleAtLeast(user, item.minRoleLevel ?? 1) && aAccesPage(item),
  );

  // Le seul item réellement actif pour le pathname courant — voir docstring de module (bug
  // "/boutique" + "/boutique/commandes" tous les deux surlignés). Parmi tous les items dont le
  // `to` correspond (égal, ou préfixe de segment), on ne retient que le plus long, donc le plus
  // spécifique : "/boutique/commandes" gagne sur "/boutique" quand les deux correspondent, mais
  // "/boutique" reste actif sur une sous-page sans item dédié (ex. "/boutique/panier"), puisqu'il
  // est alors seul candidat.
  const activeTo = visibleItems.reduce<string | null>((best, item) => {
    const correspond =
      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    if (!correspond) return best;
    return best === null || item.to.length > best.length ? item.to : best;
  }, null);

  function isItemActive(item: NavItem): boolean {
    return item.to === activeTo;
  }

  function itemALeSignal(item: NavItem): boolean {
    return notificationsNonLues.some(
      (n) => n.lien === item.to || n.lien.startsWith(`${item.to}/`),
    );
  }

  function handleClicItem(item: NavItem) {
    // Ne déclenche l'appel que si un point est effectivement affiché — inutile de solliciter
    // le backend à chaque clic de navigation ordinaire.
    if (itemALeSignal(item)) {
      marquerLuesPrefixeMutation.mutate(item.to);
    }
  }

  // Groupes non vides, dans l'ordre fixe GROUP_ORDER, chacun sachant s'il contient la page
  // active — sert uniquement à mettre l'en-tête (ou le bouton-icône en mode rail) en évidence,
  // jamais à forcer le dépli (voir docstring : la préférence de repli de l'utilisateur reste
  // toujours prioritaire).
  const groups: SidebarNavGroup[] = GROUP_ORDER.map((key) => {
    const items = visibleItems.filter((item) => item.group === key);
    return { key, items, hasActiveItem: items.some(isItemActive) };
  }).filter((group) => group.items.length > 0);

  return { visibleItems, groups, isItemActive, itemALeSignal, handleClicItem };
}

/** Lien de navigation avec icône, libellé et point d'activité — toujours avec libellé visible
 * (jamais en mode icône seule + tooltip `title`, contrairement à l'ancienne version : ce rendu
 * sert désormais à la fois à l'accordéon déplié, au flyout d'un groupe replié et au tiroir
 * mobile, qui ont tous la place d'afficher le texte). */
function NavItemLink({
  item,
  active,
  signale,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  signale: boolean;
  onNavigate: () => void;
}) {
  const { t } = useTranslation("common");
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-cid px-3 py-2 text-sm transition ${
        active ? "bg-ca font-semibold text-white" : "text-white/70 hover:bg-white/5"
      }`}
    >
      <span className="relative shrink-0">
        <Icon size={18} />
        {signale && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-ca ring-2 ring-sb"
            aria-label={t("nav.point_activite", { module: t(item.labelKey) })}
            role="status"
          />
        )}
      </span>
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

/** Accordéon groupé (libellés visibles) — mode déplié de `Sidebar` ET tiroir mobile
 * (`MobileNavDrawer`), d'où son export : même logique de dépli/repli par groupe (uiStore), donc
 * mieux vaut un seul composant que deux implémentations qui pourraient diverger. */
export function NavAccordionList({
  groups,
  isItemActive,
  itemALeSignal,
  onNavigate,
}: {
  groups: SidebarNavGroup[];
  isItemActive: (item: NavItem) => boolean;
  itemALeSignal: (item: NavItem) => boolean;
  onNavigate: (item: NavItem) => void;
}) {
  const { t } = useTranslation("common");
  const collapsedGroups = useUiStore((s) => s.collapsedGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);

  return (
    <>
      {groups.map((group) => {
        const expanded = !collapsedGroups[group.key];
        return (
          <div key={group.key} className="pt-1 first:pt-0">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={`flex w-full items-center justify-between rounded-cid px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition hover:text-white/70 ${
                // Repliée mais contenant la page active : en-tête mis en évidence plutôt que
                // forcer l'ouverture (voir docstring) — reste un simple repère visuel.
                group.hasActiveItem ? "text-white/70" : "text-white/40"
              }`}
            >
              <span className="truncate">{t(GROUP_LABEL_KEYS[group.key])}</span>
              <IconChevronDown
                size={14}
                className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
              />
            </button>
            {expanded && (
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavItemLink
                    key={item.to}
                    item={item}
                    active={isItemActive(item)}
                    signale={itemALeSignal(item)}
                    onNavigate={() => onNavigate(item)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Bouton-icône d'un groupe en mode rail (replié) + son flyout — voir docstring de module. Ouvert
 * au clic (jamais au survol seul : plus fiable au trackpad/tactile et bien plus simple à tester
 * qu'un délai d'ouverture/fermeture au survol), fermé au clic extérieur, sur Échap, ou après
 * avoir suivi un lien.
 *
 * Bug corrigé le 2026-09-22 (retour utilisateur : "Wenn die Side zugeklappt ist und ich auf einem
 * Icon der Gruppen Klicke, passiert nichts") : le flyout s'ouvrait bien (état React, DOM, tests —
 * tout confirmait un clic fonctionnel), mais restait invisible en production. Cause : `<aside>`
 * (voir Sidebar ci-dessous) porte `overflow-hidden` depuis l'introduction du rail repliable, pour
 * contenir sa propre transition de largeur — un flyout `absolute left-full` (donc positionné hors
 * de la boîte de 64px du rail) se retrouvait rogné par cet ancêtre, invisible malgré un rendu DOM
 * correct. D'où son passage en portail (`createPortal` vers `document.body`) avec des coordonnées
 * `fixed` calculées depuis `getBoundingClientRect()` du bouton — s'affranchit de tout ancêtre à
 * `overflow`/`z-index` limité, comme un flyout de VS Code ou de Slack. */
function RailGroupButton({
  group,
  isItemActive,
  itemALeSignal,
  onNavigate,
}: {
  group: SidebarNavGroup;
  isItemActive: (item: NavItem) => boolean;
  itemALeSignal: (item: NavItem) => boolean;
  onNavigate: (item: NavItem) => void;
}) {
  const { t } = useTranslation("common");
  const [ouvert, setOuvert] = useState(false);
  // Coordonnées écran du flyout portalé — recalculées à chaque ouverture (voir alterner
  // ci-dessous) : le rail est en h-screen sans défilement propre (voir Sidebar), sa position ne
  // bouge donc pas pendant qu'un flyout reste ouvert.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const GroupIcon = GROUP_ICONS[group.key];
  const label = t(GROUP_LABEL_KEYS[group.key]);

  useEffect(() => {
    if (!ouvert) return undefined;
    function surClicExterieur(e: MouseEvent) {
      const cible = e.target as Node;
      // Le flyout vit désormais dans un portail (document.body), donc hors de l'arbre DOM du
      // bouton : un clic à l'intérieur du flyout doit aussi compter comme "à l'intérieur",
      // sans quoi il se refermerait avant même qu'un lien ait pu être suivi.
      if (boutonRef.current?.contains(cible) || flyoutRef.current?.contains(cible)) {
        return;
      }
      setOuvert(false);
    }
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", surClicExterieur);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClicExterieur);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  function alterner() {
    if (!ouvert) {
      const rect = boutonRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.top, left: rect.right + 8 });
    }
    setOuvert((o) => !o);
  }

  return (
    <div className="relative w-full">
      <button
        ref={boutonRef}
        type="button"
        onClick={alterner}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className={`flex w-full items-center justify-center rounded-cid p-2.5 transition ${
          group.hasActiveItem
            ? "bg-white/10 text-white"
            : "text-white/60 hover:bg-white/5 hover:text-white"
        }`}
      >
        <GroupIcon size={20} />
      </button>
      {ouvert &&
        position &&
        createPortal(
          <div
            ref={flyoutRef}
            role="menu"
            aria-label={label}
            style={{ top: position.top, left: position.left }}
            className="thin-scrollbar fixed z-20 max-h-[70vh] w-56 space-y-1 overflow-y-auto rounded-cid-lg border border-white/10 bg-sb p-2 shadow-lg"
          >
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
              {label}
            </div>
            {group.items.map((item) => (
              <NavItemLink
                key={item.to}
                item={item}
                active={isItemActive(item)}
                signale={itemALeSignal(item)}
                onNavigate={() => {
                  onNavigate(item);
                  setOuvert(false);
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function Sidebar() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const { groups, isItemActive, itemALeSignal, handleClicItem } = useSidebarNav();

  function handleLogout() {
    // logout() vide aussi le cache React Query (cf queryClient.ts) — sans
    // quoi les données du compte qui se déconnecte resteraient visibles au
    // prochain compte connecté dans le même onglet.
    logout();
    navigate("/login", { replace: true });
  }

  return (
    // hidden lg:flex (ajouté le 2026-09-22) : sous 1024px, la navigation passe par
    // MobileNavDrawer (tiroir plein écran depuis le bouton menu de AppLayout) plutôt que cette
    // sidebar persistante, qui prendrait une largeur disproportionnée sur un écran de téléphone.
    <aside
      className={`hidden h-screen flex-col overflow-hidden bg-sb text-white/90 transition-[width] duration-200 lg:flex ${
        collapsed ? "w-16" : "w-60"
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
      <nav
        className={
          collapsed
            ? // Rail : au plus GROUP_ORDER.length boutons (4 aujourd'hui) — tient toujours dans
              // la hauteur de l'écran, donc pas d'overflow-y-auto ici : un ancêtre qui défile
              // rognerait le flyout positionné en absolute (voir RailGroupButton).
              "flex flex-1 flex-col items-center gap-1 px-2 py-1"
            : // overflow-y-auto + min-h-0 : le nombre de modules a fini par dépasser la hauteur
              // de l'écran (bug remonté en test manuel — la sidebar sombre s'arrêtait avant la
              // fin des items, qui continuaient sur le fond clair de la page). Sans min-h-0, un
              // enfant flex-1 ne se contracte jamais en dessous de son contenu, donc
              // overflow-y-auto n'avait aucun effet. thin-scrollbar (index.css) remplace la
              // scrollbar native épaisse par la fine scrollbar déjà prévue dans le mockup
              // (.sb::-webkit-scrollbar) mais jamais reprise ici jusqu'ici — retour utilisateur
              // du 2026-09-22 ("Die Sidebar mit der Scrollbar stört mich").
              "thin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2"
        }
      >
        {collapsed
          ? groups.map((group) => (
              <RailGroupButton
                key={group.key}
                group={group}
                isItemActive={isItemActive}
                itemALeSignal={itemALeSignal}
                onNavigate={handleClicItem}
              />
            ))
          : (
              <NavAccordionList
                groups={groups}
                isItemActive={isItemActive}
                itemALeSignal={itemALeSignal}
                onNavigate={handleClicItem}
              />
            )}
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
