import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useMembresHooks from "../../hooks/useMembres";
import { useAuthStore } from "../../store/authStore";
import type { GroupeChat } from "../../types/communaute";
import GroupesPage from "./GroupesPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useGroupes: vi.fn(), useCreerGroupe: vi.fn(), useRejoindreGroupe: vi.fn() };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return { ...actual, useMembresList: vi.fn() };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function groupe(overrides: Partial<GroupeChat> = {}): GroupeChat {
  return {
    id: "g1",
    nom: "Supporters Berlin",
    description: "Groupe des supporters à Berlin.",
    type_groupe: "public",
    createur: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    created_at: "2026-01-01T10:00:00Z",
    nombre_membres: 5,
    est_membre: false,
    ...overrides,
  };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

describe("GroupesPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useCreerGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerGroupe>>(),
    );
    vi.mocked(useCommunauteHooks.useRejoindreGroupe).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useRejoindreGroupe>>(),
    );
    vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
  });

  it("affiche la liste des groupes", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([groupe()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("Supporters Berlin")).toBeInTheDocument();
  });

  it("affiche un message si aucun groupe", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("groupes.aucun_groupe")).toBeInTheDocument();
  });

  it("propose 'Rejoindre' pour un groupe dont on n'est pas encore membre", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([groupe({ est_membre: false })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("groupes.rejoindre")).toBeInTheDocument();
  });

  it("propose 'Ouvrir' pour un groupe dont on est déjà membre", () => {
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([groupe({ est_membre: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    expect(screen.getByText("groupes.ouvrir")).toBeInTheDocument();
  });

  it("crée un groupe public", () => {
    const creer = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerGroupe>>();
    vi.mocked(useCommunauteHooks.useCreerGroupe).mockReturnValue(creer);
    vi.mocked(useCommunauteHooks.useGroupes).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useGroupes>);

    renderWithProviders(<GroupesPage />);

    fireEvent.click(screen.getByText("groupes.nouveau_groupe"));
    fireEvent.change(screen.getByPlaceholderText("groupes.nom_placeholder"), {
      target: { value: "Nouveau groupe" },
    });
    fireEvent.click(screen.getByText("groupes.creer"));

    expect(creer.mutate).toHaveBeenCalledWith(
      { nom: "Nouveau groupe", description: "", type_groupe: "public", membres_invites: undefined },
      expect.anything(),
    );
  });
});
