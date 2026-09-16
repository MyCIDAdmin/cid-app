import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useNotificationsHooks from "../../hooks/useNotifications";
import { queryClient } from "../../queryClient";
import { useAuthStore } from "../../store/authStore";
import { DEFAULT_COLLAPSED_GROUPS, useUiStore } from "../../store/uiStore";
import type { Notification } from "../../types/notification";
import Sidebar from "./Sidebar";

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

describe("Sidebar — déconnexion (AHM-51)", () => {
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
  });

  it("affiche un bouton de déconnexion pour un utilisateur connecté", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("action.deconnexion")).toBeInTheDocument();
  });

  it("vide l'état d'authentification et le cache React Query au clic", () => {
    // Simule des données d'un compte précédent encore en cache (cf bug
    // corrigé : ces données ne doivent pas fuiter vers le prochain compte
    // connecté dans le même onglet).
    queryClient.setQueryData(["membres", "list"], { results: [{ id: "m1" }] });

    renderWithProviders(<Sidebar />, { route: "/dashboard", path: "/dashboard" });
    fireEvent.click(screen.getByText("action.deconnexion"));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryData(["membres", "list"])).toBeUndefined();
  });

  it("se replie et se déplie au clic sur le bouton dédié (persisté via uiStore)", () => {
    const { container } = renderWithProviders(<Sidebar />);

    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("action.replier_sidebar"));

    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.queryByText("nav.dashboard")).not.toBeInTheDocument();
    // Repliée, les items restent identifiables : icône toujours affichée (cf
    // NAV_ITEMS.icon) + libellé exposé en `title` natif à la place du texte.
    expect(container.querySelectorAll("nav svg").length).toBeGreaterThan(0);
    expect(screen.getByTitle("nav.dashboard")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("action.deplier_sidebar"));

    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();
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
    // seul le module "/cotisations/relances" lui-même (Échéances des relances, visible
    // uniquement Directeur Financier+) le ferait, absent ici (utilisateur = simple membre).
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
