import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as useRbacHooks from "../hooks/useRbac";
import { useAuthStore } from "../store/authStore";
import RequireRole from "./RequireRole";

vi.mock("../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../hooks/useRbac");
  return { ...actual, useMesAcces: vi.fn() };
});

function setUser(role: "membre" | "rh" | "super_admin" | null) {
  useAuthStore.setState({
    isAuthenticated: role !== null,
    user: role
      ? { id: "u1", email: "u@example.com", role, langue_preferee: "fr" }
      : null,
  });
}

describe("RequireRole", () => {
  beforeEach(() => {
    vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
  });

  it("redirige quand le rôle est insuffisant", () => {
    setUser("membre");
    renderWithProviders(
      <RequireRole minRoleLevel={2}>
        <div>contenu protégé</div>
      </RequireRole>,
    );
    expect(screen.queryByText("contenu protégé")).not.toBeInTheDocument();
    expect(screen.getByTestId("route-fallback")).toBeInTheDocument();
  });

  it("rend les enfants quand le rôle est suffisant", () => {
    setUser("rh");
    renderWithProviders(
      <RequireRole minRoleLevel={2}>
        <div>contenu protégé</div>
      </RequireRole>,
    );
    expect(screen.getByText("contenu protégé")).toBeInTheDocument();
  });

  describe("mode pageSlug (Phase D)", () => {
    beforeEach(() => {
      vi.mocked(useRbacHooks.useMesAcces).mockReset();
    });

    it("affiche un indicateur de chargement plutôt que de rediriger immédiatement", () => {
      setUser("membre");
      vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
      renderWithProviders(
        <RequireRole pageSlug="page_quiz">
          <div>contenu protégé</div>
        </RequireRole>,
      );
      expect(screen.queryByText("contenu protégé")).not.toBeInTheDocument();
      expect(screen.queryByTestId("route-fallback")).not.toBeInTheDocument();
    });

    it("redirige quand la matrice refuse l'accès à cette page", async () => {
      setUser("membre");
      vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
        data: { page_quiz: "aucun" },
        isLoading: false,
      } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
      renderWithProviders(
        <RequireRole pageSlug="page_quiz">
          <div>contenu protégé</div>
        </RequireRole>,
      );
      await waitFor(() => expect(screen.getByTestId("route-fallback")).toBeInTheDocument());
      expect(screen.queryByText("contenu protégé")).not.toBeInTheDocument();
    });

    it("rend les enfants quand la matrice autorise l'accès à cette page (lecture seule incluse)", () => {
      setUser("membre");
      vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
        data: { page_quiz: "lecture" },
        isLoading: false,
      } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
      renderWithProviders(
        <RequireRole pageSlug="page_quiz">
          <div>contenu protégé</div>
        </RequireRole>,
      );
      expect(screen.getByText("contenu protégé")).toBeInTheDocument();
    });

    it("l'Administrateur App a toujours accès, sans attendre la requête réseau", () => {
      setUser("super_admin");
      vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
      renderWithProviders(
        <RequireRole pageSlug="page_quiz">
          <div>contenu protégé</div>
        </RequireRole>,
      );
      expect(screen.getByText("contenu protégé")).toBeInTheDocument();
    });
  });
});
