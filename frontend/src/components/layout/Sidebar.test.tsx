import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useNotificationsHooks from "../../hooks/useNotifications";
import * as useRbacHooks from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import { DEFAULT_COLLAPSED_GROUPS, useUiStore } from "../../store/uiStore";
import type { Notification } from "../../types/notification";
import Sidebar, { getGroupForPath } from "./Sidebar";

vi.mock("../../hooks/useNotifications", async () => {
  const actual = await vi.importActual<typeof useNotificationsHooks>(
    "../../hooks/useNotifications",
  );
  return {
    ...actual,
    useNotificationsNonLues: vi.fn(),
    useMarquerLuesPrefixe: vi.fn(),
  };
});

// Phase D (ajoutée le 2026-09-23) : useMesAcces mocké partout (par défaut "aucune page de
// gestion accessible, chargement terminé") pour ne jamais dépendre d'un vrai appel réseau dans
// ces tests — describe dédié plus bas pour la logique de visibilité elle-même. useVisibiliteEffective
// (ajouté le 2026-09-28, bug "ModuleVisibiliteMembre" sans effet) mocké de la même façon, par
// défaut "aucun module masqué" — describe dédié plus bas pour ce mécanisme.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, useMesAcces: vi.fn(), useVisibiliteEffective: vi.fn() };
});

function mockMesAcces(overrides: Partial<ReturnType<typeof useRbacHooks.useMesAcces>> = {}) {
  vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
    data: {},
    isLoading: false,
    ...overrides,
  } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
}

function mockVisibiliteEffective(
  overrides: Partial<ReturnType<typeof useRbacHooks.useVisibiliteEffective>> = {},
) {
  vi.mocked(useRbacHooks.useVisibiliteEffective).mockReturnValue({
    data: {},
    isLoading: false,
    ...overrides,
  } as unknown as ReturnType<typeof useRbacHooks.useVisibiliteEffective>);
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    type_notification: "evenement_invitation",
    titre: "Nouvel événement",
    message: "…",
    lien: "/evenements/1",
    lu: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const utilisateur = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

// Rôle le plus élevé (cf ROLE_LEVELS dans authStore) : seul lui voit le groupe "Administration"
// dans les tests ci-dessous qui en ont besoin.
const administrateur = {
  ...utilisateur,
  id: "u2",
  email: "admin@example.com",
  role: "super_admin" as const,
};

// Déconnexion déplacée vers UserMenu.tsx le 2026-09-28 (retour utilisateur, point 2.3 : "Der
// Button für die Abmeldung soll auch unter dem User Profil umgezogen werden") — voir
// UserMenu.test.tsx pour sa couverture désormais.
describe("Sidebar — repli/dépli, groupes et navigation", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateur,
      isAuthenticated: true,
    });
    useUiStore.setState({ sidebarCollapsed: false, collapsedGroups: DEFAULT_COLLAPSED_GROUPS });
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);
    vi.mocked(useNotificationsHooks.useMarquerLuesPrefixe).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useNotificationsHooks.useMarquerLuesPrefixe>);
    mockMesAcces();
    mockVisibiliteEffective();
  });

  it("se replie et se déplie au clic sur le bouton dédié (persisté via uiStore)", () => {
    const { container } = renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("action.replier_sidebar"));

    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.queryByText("nav.dashboard")).not.toBeInTheDocument();
    // Repliée (refonte du 2026-09-22, voir docstring de Sidebar.tsx) : le rail n'affiche plus
    // les items à plat mais un bouton-icône par groupe — les items eux-mêmes ne réapparaissent
    // qu'au clic sur ce bouton, dans son flyout.
    expect(container.querySelectorAll("nav svg").length).toBeGreaterThan(0);
    const boutonGroupeGeneral = screen.getByTitle("nav_groupe.general");
    expect(boutonGroupeGeneral).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(boutonGroupeGeneral);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("action.deplier_sidebar"));

    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();
  });

  it("ouvre le flyout d'un groupe au clic, le referme au clic extérieur puis sur Échap", () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderWithProviders(<Sidebar />);

    fireEvent.click(screen.getByTitle("nav_groupe.general"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Clic en dehors du conteneur du bouton/flyout — se referme (voir RailGroupButton).
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("nav_groupe.general"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // Bug corrigé le 2026-09-22 (retour utilisateur : "Wenn die Side zugeklappt ist und ich auf
  // einem Icon der Gruppen Klicke, passiert nichts") — le flyout s'ouvrait déjà dans le DOM
  // (voir tests ci-dessus), mais restait invisible en production, rogné par `overflow-hidden`
  // sur <aside>. Test de non-régression structurel : le flyout doit vivre hors de l'arbre DOM
  // rendu par Sidebar (portalé sur document.body via createPortal), jamais comme descendant de
  // <aside> — jsdom ne peut pas vérifier le rendu visuel/le clipping CSS lui-même.
  it("rend le flyout hors de l'arbre de la sidebar (portail document.body), pour échapper à l'overflow-hidden de <aside>", () => {
    useUiStore.setState({ sidebarCollapsed: true });
    const { container } = renderWithProviders(<Sidebar />);

    fireEvent.click(screen.getByTitle("nav_groupe.general"));

    const flyout = screen.getByRole("menu");
    expect(container.contains(flyout)).toBe(false);
    expect(document.body.contains(flyout)).toBe(true);
  });

  it("referme le flyout du groupe après avoir suivi un de ses liens", () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderWithProviders(<Sidebar />);

    fireEvent.click(screen.getByTitle("nav_groupe.general"));
    fireEvent.click(screen.getByText("nav.dashboard"));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("regroupe les modules par catégorie, le groupe Administration replié par défaut", () => {
    useAuthStore.setState({ user: administrateur });
    renderWithProviders(<Sidebar />);

    // Groupe "Général" (toujours ouvert par défaut) : ses items sont visibles directement.
    expect(screen.getByText("nav_groupe.general")).toBeInTheDocument();
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    // Groupe "Administration" (replié par défaut, cf uiStore.DEFAULT_COLLAPSED_GROUPS) : l'en-tête
    // est là mais pas ses items — sans ça, super_admin verrait toujours ses 9 modules admin.
    expect(screen.getByText("nav_groupe.administration")).toBeInTheDocument();
    expect(screen.queryByText("nav.admin_events")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("nav_groupe.administration"));

    expect(useUiStore.getState().collapsedGroups.administration).toBe(false);
    expect(screen.getByText("nav.admin_events")).toBeInTheDocument();
  });

  it("permet de replier le groupe Général même quand sa page (tableau de bord) est active", () => {
    // Bug corrigé : une première version forçait l'ouverture du groupe contenant la page
    // active, ce qui rendait "Général" impossible à replier en pratique (il contient le
    // tableau de bord, donc quasiment toujours actif) — le clic sur l'en-tête doit primer.
    renderWithProviders(<Sidebar />, { route: "/dashboard", path: "/dashboard" });

    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByText("nav_groupe.general"));

    expect(useUiStore.getState().collapsedGroups.general).toBe(true);
    expect(screen.queryByText("nav.dashboard")).not.toBeInTheDocument();
    // L'en-tête reste néanmoins mis en évidence pour indiquer que la page active s'y trouve.
    expect(screen.getByText("nav_groupe.general").closest("button")).toHaveClass("text-white/70");
  });

  // "Mes commandes"/"Mes bons d'achat" repliées dans Boutique le 2026-09-23 (voir docstring de
  // Sidebar.tsx) : "/boutique" n'a plus de sous-route partageant son préfixe avec un item dédié,
  // le bug de double-highlight corrigé le 2026-09-21 n'a donc plus de scénario à tester ici — la
  // couverture générale (sous-page sans item dédié) reste ci-dessous.
  it("reste actif sur Boutique pour une sous-page sans item dédié (ex. le panier)", () => {
    renderWithProviders(<Sidebar />, { route: "/boutique/panier", path: "/boutique/panier" });

    expect(screen.getByText("nav.boutique").closest("a")).toHaveClass("bg-ca");
  });
});

describe("Sidebar — point d'activité par module (demande utilisateur du 2026-09-16)", () => {
  let marquerLuesPrefixeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateur,
      isAuthenticated: true,
    });
    useUiStore.setState({ sidebarCollapsed: false, collapsedGroups: DEFAULT_COLLAPSED_GROUPS });
    marquerLuesPrefixeMock = vi.fn();
    vi.mocked(useNotificationsHooks.useMarquerLuesPrefixe).mockReturnValue({
      mutate: marquerLuesPrefixeMock,
    } as unknown as ReturnType<typeof useNotificationsHooks.useMarquerLuesPrefixe>);
    mockMesAcces();
    mockVisibiliteEffective();
  });

  it("affiche un point sur le module concerné par une notification non lue", () => {
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [notification({ lien: "/evenements/1" })] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);

    renderWithProviders(<Sidebar />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("n'affiche aucun point sans notification non lue", () => {
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);

    renderWithProviders(<Sidebar />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("un lien plus précis n'allume pas un préfixe plus court non concerné (ex. /cotisations/en-attente ne déclenche pas le point de /cotisations)", () => {
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [notification({ lien: "/cotisations/relances" })],
      },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);

    renderWithProviders(<Sidebar />);

    // "/cotisations" ne commence pas par "/cotisations/relances/" donc ne s'allume pas —
    // seul le module "/cotisations/relances" lui-même (Échéances des relances, piloté par la
    // matrice depuis Phase D — page_cotisations_relances) le ferait, absent ici (mockMesAcces()
    // par défaut = aucun accès, utilisateur = simple membre de toute façon).
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("marque le module comme lu au clic, ce qui éteint le point (glocke incluse)", () => {
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [notification({ lien: "/evenements/1" })] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);

    renderWithProviders(<Sidebar />);
    fireEvent.click(screen.getByText("nav.evenements"));

    expect(marquerLuesPrefixeMock).toHaveBeenCalledWith("/evenements");
  });

  it("ne déclenche aucun appel au clic sur un module sans point", () => {
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);

    renderWithProviders(<Sidebar />);
    fireEvent.click(screen.getByText("nav.dashboard"));

    expect(marquerLuesPrefixeMock).not.toHaveBeenCalled();
  });
});

describe("Sidebar — visibilité pilotée par la matrice (Phase D, ajoutée le 2026-09-23)", () => {
  const gestionnaire = { ...utilisateur, id: "u3", email: "gestion@example.com" };

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: gestionnaire,
      isAuthenticated: true,
    });
    // Groupe "Administration" déjà déplié — ces tests portent sur la présence/absence des items
    // eux-mêmes, pas sur le mécanisme d'accordéon (déjà couvert plus haut).
    useUiStore.setState({
      sidebarCollapsed: false,
      collapsedGroups: { ...DEFAULT_COLLAPSED_GROUPS, administration: false },
    });
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);
    vi.mocked(useNotificationsHooks.useMarquerLuesPrefixe).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useNotificationsHooks.useMarquerLuesPrefixe>);
    mockVisibiliteEffective();
  });

  it("affiche un item pageSlug quand la matrice l'autorise pour ce rôle, masque les autres", () => {
    mockMesAcces({ data: { page_quiz: "lecture_ecriture", page_boutique: "aucun" } });
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.admin_quiz")).toBeInTheDocument();
    expect(screen.queryByText("nav.admin_boutique")).not.toBeInTheDocument();
  });

  it("masque un item pageSlug tant qu'aucune entrée de matrice ne l'autorise (défaut fail-closed)", () => {
    mockMesAcces({ data: {} });
    renderWithProviders(<Sidebar />);

    expect(screen.queryByText("nav.admin_quiz")).not.toBeInTheDocument();
  });

  it("masque les items pageSlug pendant le chargement de la matrice, plutôt que de les afficher puis les retirer", () => {
    mockMesAcces({ data: undefined, isLoading: true });
    renderWithProviders(<Sidebar />);

    expect(screen.queryByText("nav.admin_quiz")).not.toBeInTheDocument();
  });

  it("l'Administrateur App voit toujours les items pageSlug, même si la matrice charge encore ou ne les mentionne pas", () => {
    useAuthStore.setState({ user: administrateur });
    mockMesAcces({ data: undefined, isLoading: true });
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.admin_quiz")).toBeInTheDocument();
    expect(screen.getByText("nav.admin_boutique")).toBeInTheDocument();
  });

  it("'/admin/roles' reste hors matrice : masqué pour un rôle non-Admin App quel que soit mesAcces", () => {
    mockMesAcces({ data: { page_quiz: "lecture_ecriture" } });
    renderWithProviders(<Sidebar />);

    expect(screen.queryByText("nav.gestion_roles")).not.toBeInTheDocument();
  });

  it("affiche un item pageSlug dès que la matrice donne au moins 'lecture' (task #215 : accès à la page ≠ droit d'écriture)", () => {
    mockMesAcces({ data: { page_quiz: "lecture" } });
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.admin_quiz")).toBeInTheDocument();
  });
});

// Bug corrigé le 2026-09-28 (retour utilisateur : "Ich [...] das Module 'membres' auf nicht
// sichtbar gesetzt [...] Bein testen ist das Modul immer für ein normaler member angezeigt. Für
// alle Module nachprüfen") — GET /rbac/visibilite-membre/effective/ existait déjà côté backend
// mais n'était appelé par aucun hook frontend, donc masquer un module dans l'admin Django
// ("ModuleVisibiliteMembre") n'avait jamais d'effet sur la Sidebar. Couvre plusieurs modules
// distincts (pas seulement "membres") pour la demande explicite "für alle Module".
describe("Sidebar — visibilité de module pour le rôle Membre Normal (bug corrigé le 2026-09-28)", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateur,
      isAuthenticated: true,
    });
    useUiStore.setState({ sidebarCollapsed: false, collapsedGroups: DEFAULT_COLLAPSED_GROUPS });
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);
    vi.mocked(useNotificationsHooks.useMarquerLuesPrefixe).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useNotificationsHooks.useMarquerLuesPrefixe>);
    mockMesAcces();
  });

  it("masque '/membres' pour un Membre Normal quand le module 'membres' est masqué", () => {
    mockVisibiliteEffective({ data: { membres: false } });
    renderWithProviders(<Sidebar />);

    expect(screen.queryByText("nav.membres")).not.toBeInTheDocument();
    // Le reste du menu (module non concerné) reste inchangé.
    expect(screen.getByText("nav.evenements")).toBeInTheDocument();
  });

  it("masque aussi les autres modules quand ils sont désactivés un par un (pas seulement 'membres')", () => {
    mockVisibiliteEffective({
      data: { evenements: false, boutique: false, communaute: false, vote: false, projets: false },
    });
    renderWithProviders(<Sidebar />);

    expect(screen.queryByText("nav.evenements")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.covoiturage")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.boutique")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.fil")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.albums")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.votes")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.projets")).not.toBeInTheDocument();
    // "membres" et "adhesions" ne sont pas dans la liste ci-dessus : toujours visibles.
    expect(screen.getByText("nav.membres")).toBeInTheDocument();
    expect(screen.getByText("nav.mon_adhesion")).toBeInTheDocument();
  });

  it("module absent de la réponse (aucune ligne en base) reste visible, même défaut que le backend", () => {
    mockVisibiliteEffective({ data: {} });
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.membres")).toBeInTheDocument();
  });

  it("n'affiche pas puis ne masque pas l'item pendant le chargement (reste visible, défaut sûr)", () => {
    mockVisibiliteEffective({ data: undefined, isLoading: true });
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.membres")).toBeInTheDocument();
  });

  it("un rôle supérieur au Membre Normal garde toujours l'accès, quel que soit ce réglage (spécifique au rôle 'membre', voir docstring backend)", () => {
    useAuthStore.setState({ user: { ...utilisateur, id: "u4", role: "bureau_admin" as const } });
    mockVisibiliteEffective({ data: { membres: false } });
    renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.membres")).toBeInTheDocument();
  });
});

// Ajouté le 2026-09-26 (plan "Öffentliche mycid.org-Startseite" section B) — AppLayout.tsx s'en
// sert pour décider si le PublicFooter apparaît sous la page courante. Fonction pure, testée
// directement plutôt qu'en passant par un rendu complet de Sidebar/AppLayout.
describe("getGroupForPath", () => {
  it("retrouve le groupe d'un item exact", () => {
    expect(getGroupForPath("/dashboard")).toBe("general");
    expect(getGroupForPath("/fil")).toBe("communaute");
    expect(getGroupForPath("/albums")).toBe("contenu");
    expect(getGroupForPath("/admin/boutique")).toBe("administration");
  });

  it("retrouve le groupe d'une sous-page via le préfixe le plus spécifique", () => {
    expect(getGroupForPath("/boutique/panier")).toBe("general");
    expect(getGroupForPath("/membres/123/modifier")).toBe("general");
    expect(getGroupForPath("/forum/42")).toBe("communaute");
  });

  it("ne confond pas un préfixe partiel non séparé par '/' (régression : l'ancien item /cotisation, groupe general, retiré en Phase F, ne doit pas réapparaître dans la résolution de /cotisations/en-attente)", () => {
    // Jusqu'au retrait de l'entrée Sidebar "/cotisation" (Phase F, fusion "Mitgliedsbeitrag" ->
    // "Meine Mitgliedschaft", 2026-09-26), ce test vérifiait que "/cotisations/en-attente" (son
    // propre item dédié, groupe administration) ne matchait jamais le préfixe textuel de
    // "/cotisation" (groupe general) faute de séparateur "/". L'item "/cotisation" a disparu de
    // NAV_ITEMS, mais le test reste utile en garde de non-régression : "/cotisations/en-attente"
    // doit continuer à résoudre "administration" via son propre item exact.
    expect(getGroupForPath("/cotisations/en-attente")).toBe("administration");
  });

  it("renvoie null pour une route sans item Sidebar correspondant", () => {
    expect(getGroupForPath("/login")).toBeNull();
    expect(getGroupForPath("/route-inconnue")).toBeNull();
  });
});
