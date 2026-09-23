import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useUtilisateursHooks from "../../hooks/useUtilisateurs";
import * as useRbacHooks from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { UtilisateursPage } from "../../types/utilisateur";
import type { MatriceReponse } from "../../types/rbac";
import AttributionRolesTab from "./AttributionRolesTab";

vi.mock("../../hooks/useUtilisateurs", async () => {
  const actual =
    await vi.importActual<typeof useUtilisateursHooks>("../../hooks/useUtilisateurs");
  return { ...actual, useUtilisateursList: vi.fn() };
});

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return {
    ...actual,
    useRbacMatrice: vi.fn(),
    useRolesUtilisateur: vi.fn(),
    useAssignerRolesUtilisateur: vi.fn(),
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

const roleMembre = {
  id: "role-membre",
  slug: "membre",
  nom: "Normales Mitglied",
  description: "",
  is_system: true,
  ordre: 0,
  actif: true,
  created_at: "",
  updated_at: "",
};
const roleVertrieb = {
  id: "role-vertrieb",
  slug: "vertrieb",
  nom: "Vertrieb",
  description: "",
  is_system: false,
  ordre: 1,
  actif: true,
  created_at: "",
  updated_at: "",
};

const matrice: MatriceReponse = {
  roles: [roleMembre, roleVertrieb],
  modules: [{ slug: "membres", label: "Mitglieder" }],
  cells: [],
};

function mockListUtilisateurs(
  overrides: Partial<ReturnType<typeof useUtilisateursHooks.useUtilisateursList>> = {},
) {
  vi.mocked(useUtilisateursHooks.useUtilisateursList).mockReturnValue({
    data: page,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useUtilisateursHooks.useUtilisateursList>);
}

describe("AttributionRolesTab", () => {
  const assignerMutate = vi.fn();

  beforeEach(() => {
    assignerMutate.mockReset();
    useAuthStore.setState({
      user: { id: "u1", email: "admin@clubistes.de", role: "super_admin", langue_preferee: "fr" },
    });
    mockListUtilisateurs();
    vi.mocked(useRbacHooks.useRbacMatrice).mockReturnValue({
      data: matrice,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRbacHooks.useRbacMatrice>);
    vi.mocked(useRbacHooks.useRolesUtilisateur).mockReturnValue({
      data: { user_id: "u2", role_ids: ["role-membre"], role_primaire: "membre" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRbacHooks.useRolesUtilisateur>);
    vi.mocked(useRbacHooks.useAssignerRolesUtilisateur).mockReturnValue({
      mutate: assignerMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRbacHooks.useAssignerRolesUtilisateur>);
  });

  it("affiche les utilisateurs retournés par la liste", () => {
    renderWithProviders(<AttributionRolesTab />);

    expect(screen.getByText("Abir Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("abir@example.com")).toBeInTheDocument();
  });

  it("affiche un message si aucun résultat", () => {
    mockListUtilisateurs({ data: { next: null, previous: null, results: [] } });
    renderWithProviders(<AttributionRolesTab />);

    expect(screen.getByText("liste.aucun_resultat")).toBeInTheDocument();
  });

  it("désactive le bouton de gestion des rôles pour son propre compte", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "abir@example.com", role: "super_admin", langue_preferee: "fr" },
    });
    renderWithProviders(<AttributionRolesTab />);

    expect(screen.getByText("attribution.gerer_roles")).toBeDisabled();
  });

  it("ouvre la gestion des rôles avec Normales Mitglied coché et verrouillé", () => {
    renderWithProviders(<AttributionRolesTab />);

    fireEvent.click(screen.getByText("attribution.gerer_roles"));

    const caseMembre = screen.getByLabelText("Normales Mitglied") as HTMLInputElement;
    expect(caseMembre.checked).toBe(true);
    expect(caseMembre).toBeDisabled();
    expect(screen.getByLabelText("Vertrieb")).not.toBeDisabled();
  });

  it("attribue un rôle additionnel et enregistre", async () => {
    assignerMutate.mockImplementation((_vars, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    );
    renderWithProviders(<AttributionRolesTab />);

    fireEvent.click(screen.getByText("attribution.gerer_roles"));
    fireEvent.click(screen.getByLabelText("Vertrieb"));
    fireEvent.click(screen.getByText("attribution.enregistrer"));

    await waitFor(() =>
      expect(assignerMutate).toHaveBeenCalledWith(
        { userId: "u2", roleIds: ["role-membre", "role-vertrieb"] },
        expect.anything(),
      ),
    );
    expect(screen.getByText("attribution.succes_message")).toBeInTheDocument();
  });

  it("affiche une erreur si l'attribution échoue", async () => {
    assignerMutate.mockImplementation((_vars, { onError }: { onError: (e: unknown) => void }) =>
      onError(new Error("network")),
    );
    renderWithProviders(<AttributionRolesTab />);

    fireEvent.click(screen.getByText("attribution.gerer_roles"));
    fireEvent.click(screen.getByText("attribution.enregistrer"));

    expect(await screen.findByText("attribution.erreur_action")).toBeInTheDocument();
  });
});
