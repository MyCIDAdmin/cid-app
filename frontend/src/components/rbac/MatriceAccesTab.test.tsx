import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useRbacHooks from "../../hooks/useRbac";
import type { MatriceReponse } from "../../types/rbac";
import MatriceAccesTab from "./MatriceAccesTab";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return {
    ...actual,
    useRbacMatrice: vi.fn(),
    useSetMatriceCellule: vi.fn(),
    useCreerRole: vi.fn(),
    useModifierRole: vi.fn(),
    useSupprimerRole: vi.fn(),
  };
});

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
  cells: [{ role_id: "role-vertrieb", module: "membres", niveau_acces: "lecture" }],
};

describe("MatriceAccesTab", () => {
  const setCelluleMutate = vi.fn();
  const creerRoleMutate = vi.fn();
  const supprimerRoleMutate = vi.fn();

  beforeEach(() => {
    setCelluleMutate.mockReset();
    creerRoleMutate.mockReset();
    supprimerRoleMutate.mockReset();
    vi.mocked(useRbacHooks.useRbacMatrice).mockReturnValue({
      data: matrice,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRbacHooks.useRbacMatrice>);
    vi.mocked(useRbacHooks.useSetMatriceCellule).mockReturnValue({
      mutate: setCelluleMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRbacHooks.useSetMatriceCellule>);
    vi.mocked(useRbacHooks.useCreerRole).mockReturnValue({
      mutate: creerRoleMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRbacHooks.useCreerRole>);
    vi.mocked(useRbacHooks.useSupprimerRole).mockReturnValue({
      mutate: supprimerRoleMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRbacHooks.useSupprimerRole>);
  });

  it("affiche les rôles et le niveau d'accès actuel de chaque cellule", () => {
    renderWithProviders(<MatriceAccesTab />);

    expect(screen.getByText("Normales Mitglied")).toBeInTheDocument();
    expect(screen.getByText("Vertrieb")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Vertrieb — Mitglieder") as HTMLSelectElement).value,
    ).toBe("lecture");
  });

  it("change une cellule de la matrice", () => {
    renderWithProviders(<MatriceAccesTab />);

    fireEvent.change(screen.getByLabelText("Vertrieb — Mitglieder"), {
      target: { value: "lecture_ecriture" },
    });

    expect(setCelluleMutate).toHaveBeenCalledWith({
      role_id: "role-vertrieb",
      module: "membres",
      niveau_acces: "lecture_ecriture",
    });
  });

  it("empêche la suppression d'un rôle système", () => {
    renderWithProviders(<MatriceAccesTab />);

    const boutons = screen.getAllByText("acces.supprimer.bouton");
    expect(boutons[0]).toBeDisabled();
    expect(boutons[1]).not.toBeDisabled();
  });

  it("supprime un rôle personnalisé après confirmation", async () => {
    supprimerRoleMutate.mockImplementation((_id, { onSuccess }: { onSuccess: () => void }) =>
      onSuccess(),
    );
    renderWithProviders(<MatriceAccesTab />);

    const boutons = screen.getAllByText("acces.supprimer.bouton");
    fireEvent.click(boutons[1]);
    fireEvent.click(screen.getByText("acces.supprimer.bouton", { selector: "button.bg-status-dangerText" }));

    await waitFor(() => expect(supprimerRoleMutate).toHaveBeenCalledWith("role-vertrieb", expect.anything()));
  });

  it("crée un nouveau rôle personnalisé", async () => {
    creerRoleMutate.mockImplementation((_payload, { onSuccess }: { onSuccess: (r: unknown) => void }) =>
      onSuccess({ id: "role-design", nom: "Design" }),
    );
    renderWithProviders(<MatriceAccesTab />);

    fireEvent.change(screen.getByLabelText("acces.nouveau_role.nom_label"), {
      target: { value: "Design" },
    });
    fireEvent.change(screen.getByLabelText("acces.nouveau_role.slug_label"), {
      target: { value: "design" },
    });
    fireEvent.click(screen.getByText("acces.nouveau_role.creer"));

    await waitFor(() =>
      expect(creerRoleMutate).toHaveBeenCalledWith(
        { slug: "design", nom: "Design", description: "" },
        expect.anything(),
      ),
    );
    expect(screen.getByText("acces.nouveau_role.succes")).toBeInTheDocument();
  });

  it("affiche une erreur si la création échoue", async () => {
    creerRoleMutate.mockImplementation((_payload, { onError }: { onError: (e: unknown) => void }) =>
      onError(new Error("network")),
    );
    renderWithProviders(<MatriceAccesTab />);

    fireEvent.change(screen.getByLabelText("acces.nouveau_role.nom_label"), {
      target: { value: "Design" },
    });
    fireEvent.change(screen.getByLabelText("acces.nouveau_role.slug_label"), {
      target: { value: "design" },
    });
    fireEvent.click(screen.getByText("acces.nouveau_role.creer"));

    expect(await screen.findByText("acces.nouveau_role.erreur")).toBeInTheDocument();
  });
});
