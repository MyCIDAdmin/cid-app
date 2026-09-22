/**
 * Tests du tiroir de navigation mobile (voir docstring de MobileNavDrawer.tsx — refonte du
 * 2026-09-22, "Die App werden wir auch für Mobile kompatibel machen"). Se limite au
 * comportement propre à la coquille du tiroir (ouverture/fermeture, backdrop, Échap,
 * déconnexion) : le calcul de navigation lui-même (item actif, points d'activité, groupement
 * par rôle) est déjà couvert par Sidebar.test.tsx via le hook partagé `useSidebarNav`.
 */
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useNotificationsHooks from "../../hooks/useNotifications";
import { useAuthStore } from "../../store/authStore";
import { DEFAULT_COLLAPSED_GROUPS, useUiStore } from "../../store/uiStore";
import MobileNavDrawer from "./MobileNavDrawer";

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

const utilisateur = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

describe("MobileNavDrawer", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "access",
      refreshToken: "refresh",
      user: utilisateur,
      isAuthenticated: true,
    });
    useUiStore.setState({ collapsedGroups: DEFAULT_COLLAPSED_GROUPS });
    vi.mocked(useNotificationsHooks.useNotificationsNonLues).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useNotificationsHooks.useNotificationsNonLues>);
    vi.mocked(useNotificationsHooks.useMarquerLuesPrefixe).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useNotificationsHooks.useMarquerLuesPrefixe>);
  });

  it("ne rend rien quand fermé", () => {
    renderWithProviders(<MobileNavDrawer open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("affiche les modules quand ouvert", () => {
    renderWithProviders(<MobileNavDrawer open onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("nav.dashboard")).toBeInTheDocument();
  });

  it("se ferme au clic sur le bouton fermer", () => {
    const onClose = vi.fn();
    renderWithProviders(<MobileNavDrawer open onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("action.fermer_menu"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se ferme sur Échap", () => {
    const onClose = vi.fn();
    renderWithProviders(<MobileNavDrawer open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se ferme au clic sur le fond assombri", () => {
    const onClose = vi.fn();
    const { container } = renderWithProviders(<MobileNavDrawer open onClose={onClose} />);

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ferme le tiroir après avoir suivi un lien de navigation", () => {
    const onClose = vi.fn();
    renderWithProviders(<MobileNavDrawer open onClose={onClose} />);

    fireEvent.click(screen.getByText("nav.dashboard"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ferme le tiroir et déconnecte au clic sur le bouton de déconnexion", () => {
    const onClose = vi.fn();
    renderWithProviders(<MobileNavDrawer open onClose={onClose} />);

    fireEvent.click(screen.getByText("action.deconnexion"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
