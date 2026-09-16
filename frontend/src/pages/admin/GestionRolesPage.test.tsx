import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useUtilisateursHooks from "../../hooks/useUtilisateurs";
import { useAuthStore } from "../../store/authStore";
import type { UtilisateursPage } from "../../types/utilisateur";
import GestionRolesPage from "./GestionRolesPage";

vi.mock("../../hooks/useUtilisateurs", async () => {
  const actual =
    await vi.importActual<typeof useUtilisateursHooks>("../../hooks/useUtilisateurs");
  return {
    ...actual,
    useUtilisateursList: vi.fn(),
    useChangerRoleUtilisateur: vi.fn(),
  };
});

const abir = {
  id: "u2",
  email: "abir@example.com",
  role: "membre" as const,
  is_active: true,
  created_at: "2026-09-10T10:00:00Z",
  prenom: "Abir",
  nom: "Trabelsi",
};

const page: UtilisateursPage = { next: null, previous: null, results: [abir] };

function mockList(overrides: Partial<ReturnType<typeof useUtilisateursHooks.useUtilisateursList>> = {}) {
  vi.mocked(useUtilisateursHooks.useUtilisateursList).mockReturnValue({
    data: page,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useUtilisateursHooks.useUtilisateursList>);
}

describe("GestionRolesPage", () => {
  const changerRoleMutate = vi.fn();

  beforeEach(() => {
    changerRoleMutate.mockReset();
    useAuthStore.setState({
      user: { id: "u1", email: "admin@clubistes.de", role: "super_admin", langue_preferee: "fr" },
    });
    vi.mocked(useUtilisateursHooks.useChangerRoleUtilisateur).mockReturnValue({
      mutate: changerRoleMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUtilisateursHooks.useChangerRoleUtilisateur>);
  });

  it("affiche les utilisateurs retournés par la liste", () => {
    mockList();
    renderWithProviders(<GestionRolesPage />);

    expect(screen.getByText("Abir Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("abir@example.com")).toBeInTheDocument();
  });

  it("affiche un message si aucun résultat", () => {
    mockList({ data: { next: null, previous: null, results: [] } });
    renderWithProviders(<GestionRolesPage />);

    expect(screen.getByText("liste.aucun_resultat")).toBeInTheDocument();
  });

  it("change le rôle d'un utilisateur après sélection et application", async () => {
    mockList();
    changerRoleMutate.mockImplementation((_vars, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    );

    renderWithProviders(<GestionRolesPage />);

    fireEvent.change(screen.getByLabelText("liste.col_nouveau_role"), {
      target: { value: "bureau_admin" },
    });
    fireEvent.click(screen.getByText("liste.appliquer"));

    await waitFor(() =>
      expect(changerRoleMutate).toHaveBeenCalledWith(
        { id: "u2", role: "bureau_admin" },
        expect.anything(),
      ),
    );
    expect(screen.getByText("liste.succes_message")).toBeInTheDocument();
  });

  it("désactive le sélecteur de rôle pour son propre compte", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "abir@example.com", role: "super_admin", langue_preferee: "fr" },
    });
    mockList();
    renderWithProviders(<GestionRolesPage />);

    expect(screen.getByLabelText("liste.col_nouveau_role")).toBeDisabled();
  });

  it("affiche une erreur si le changement de rôle échoue", async () => {
    mockList();
    changerRoleMutate.mockImplementation((_vars, { onError }: { onError: (e: unknown) => void }) =>
      onError(new Error("network")),
    );

    renderWithProviders(<GestionRolesPage />);

    fireEvent.change(screen.getByLabelText("liste.col_nouveau_role"), {
      target: { value: "bureau_admin" },
    });
    fireEvent.click(screen.getByText("liste.appliquer"));

    expect(await screen.findByText("liste.erreur_action")).toBeInTheDocument();
  });
});
